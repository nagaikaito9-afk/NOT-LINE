// ★Supabaseの設定
const SUPABASE_URL = "https://snxfgzqvnafsnrqrhgbh.supabase.co";
const SUPABASE_KEY = "sb_publishable_aTck43w4EIMBhdUiz_sqJg_Mohv4YHc";
const GOOGLE_CLIENT_ID = "56462276148-q2n8gpnaphi48gjq7is0i07dtr4ger0v.apps.googleusercontent.com";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50' viewBox='0 0 50 50'><rect width='100%25' height='100%25' fill='%23007AFF'/><text x='50%25' y='55%25' font-family='sans-serif' font-size='20' fill='%23ffffff' text-anchor='middle'>👤</text></svg>";

let myUser = JSON.parse(localStorage.getItem('notline_myUser')) || null;
let chats = JSON.parse(localStorage.getItem('notline_chats')) || {};
let stories = JSON.parse(localStorage.getItem('notline_stories')) || [];
let appSettings = JSON.parse(localStorage.getItem('notline_settings')) || {
    font: "system-ui",
    bubbleColor: "#3b82f6",
    bubbleShape: "15px",
    theme: "light"
};
let activeFriendsList = []; // 相互に登録し合っているフレンドリスト
let pendingFriendsList = []; // 一方的に登録しているフレンドリスト

const DEFAULT_GROUP_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50' viewBox='0 0 50 50'><rect width='100%25' height='100%25' fill='%2334C759'/><text x='50%25' y='55%25' font-family='sans-serif' font-size='20' fill='%23ffffff' text-anchor='middle'>👥</text></svg>";

// ★自作スタンプ・全体スタンプの保存・初期値
let loadedStamps = JSON.parse(localStorage.getItem('notline_stamps'));
let stamps = (loadedStamps || [
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><circle cx='40' cy='40' r='38' fill='%23FFD700'/><circle cx='28' cy='30' r='5' fill='%23333'/><circle cx='52' cy='30' r='5' fill='%23333'/><path d='M25 50 Q40 68 55 50' stroke='%23333' stroke-width='4' fill='none'/></svg>",
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><circle cx='40' cy='40' r='38' fill='%231E90FF'/><circle cx='28' cy='32' r='5' fill='%23fff'/><circle cx='52' cy='32' r='5' fill='%23fff'/><path d='M28 55 Q40 40 52 55' stroke='%23fff' stroke-width='4' fill='none'/></svg>"
]).filter(s => !s.includes("circle cx='50' cy='52' r='34'") && !s.includes("circle cx='50' cy='50' r='35'"));

// ★スタンプファイル（パック）
let stampPacks = (JSON.parse(localStorage.getItem('notline_stamp_packs')) || []).filter(p => p.id !== 'pack_cat_50' && p.name !== 'ねこねこスタンプ 50選');

let activeChatId = null;
let currentSubscription = null;
let friendRealtimeChannel = null;
let globalMessagesChannel = null;
let pendingGoogleUser = null; 

// WebRTC 用の変数
let localStream = null;
let peerConnection = null;
let callSession = { active: false, roomId: null, caller: null, callee: null, type: 'audio', remoteSdp: null };
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

const callLayouts = ['layout-pip', 'layout-split-v', 'layout-split-h'];
let currentLayoutIndex = 0;
const videoFilters = ['filter-none', 'filter-grayscale', 'filter-sepia', 'filter-blur', 'filter-neon'];
let currentFilterIndex = 0;

function saveData() {
    if (myUser) localStorage.setItem('notline_myUser', JSON.stringify(myUser));
    localStorage.setItem('notline_stamps', JSON.stringify(stamps));
    localStorage.setItem('notline_stamp_packs', JSON.stringify(stampPacks));
    localStorage.setItem('notline_stories', JSON.stringify(stories));
    localStorage.setItem('notline_settings', JSON.stringify(appSettings));
    
    const chatsToSave = {};
    Object.keys(chats).forEach(id => {
        chatsToSave[id] = {
            name: chats[id].name,
            user_id: chats[id].user_id || null,
            targetUid: chats[id].targetUid || null,
            isGroup: chats[id].isGroup || false,
            unread: chats[id].unread || 0,
            avatar: chats[id].avatar,
            bgImage: chats[id].bgImage || "",
            members: chats[id].members || [],
            isPending: chats[id].isPending || false,
            isPendingReceived: chats[id].isPendingReceived || false,
            customNickname: chats[id].customNickname || null,
            isMuted: chats[id].isMuted || false,
            isBlocked: chats[id].isBlocked || false,
            isHidden: chats[id].isHidden || false
        };
    });
    localStorage.setItem('notline_chats', JSON.stringify(chatsToSave));
}

async function fetchUserFromSupabase(uid) {
    try {
        const { data, error } = await supabaseClient.from('users').select('*').eq('id', uid).maybeSingle();
        if (!error && data) return data;
    } catch (e) { console.error(e); }
    return null;
}

function sendAppNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, { body: body, icon: myUser ? myUser.avatar : "" });
    }
    showNotification(`${title}: ${body}`);
}

function showNotification(msg) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        document.getElementById('app-container').appendChild(toast);
    }
    toast.innerText = msg;
    toast.className = 'show';
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function applySettingsUI() {
    document.body.style.fontFamily = appSettings.font;
    
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        if (appSettings.theme === 'dark') {
            appContainer.classList.add('dark-theme');
        } else {
            appContainer.classList.remove('dark-theme');
        }
    }
    
    const fontSelect = document.getElementById('font-select');
    if (fontSelect) fontSelect.value = appSettings.font;
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = appSettings.theme;
    const bubbleColorPicker = document.getElementById('bubble-color-picker');
    if (bubbleColorPicker && appSettings.bubbleColor) bubbleColorPicker.value = appSettings.bubbleColor;
    const bubbleShapeSelect = document.getElementById('bubble-shape-select');
    if (bubbleShapeSelect && appSettings.bubbleShape) bubbleShapeSelect.value = appSettings.bubbleShape;

    saveData();
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function resizeImage(base64Str, maxWidth = 300, maxHeight = 300) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width; let height = img.height;
            if (width > height) {
                if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
            } else {
                if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.4));
        };
        img.onerror = () => resolve(base64Str);
    });
}

function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(window.atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
}

async function handleCredentialResponse(response) {
    const userData = parseJwt(response.credential);
    const googleId = userData.sub;

    const dbUser = await fetchUserFromSupabase(googleId);

    if (dbUser) {
        myUser = { name: dbUser.name, user_id: dbUser.user_id, avatar: dbUser.avatar || DEFAULT_AVATAR, googleId: dbUser.id, profileBg: dbUser.profile_bg };
        completeLogin();
        showNotification(`${myUser.name} としてログインしました`);
    } else {
        pendingGoogleUser = { googleId: googleId, avatar: userData.picture || DEFAULT_AVATAR, name: userData.name };
        document.getElementById('first-name-input').value = userData.name;
        document.getElementById('modal-first-name').classList.remove('hidden');
    }
}

function initGoogleLogin() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        try {
            google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse });
            const btnContainer = document.getElementById("google-btn-container");
            if (btnContainer) {
                google.accounts.id.renderButton(btnContainer, { theme: "outline", size: "large", width: "250" });
            }
        } catch (e) {
            console.error("Google login render error:", e);
        }
    } else {
        setTimeout(initGoogleLogin, 300);
    }
}

window.onload = function() {
    initGoogleLogin();
    applySettingsUI();
    setupFileInputListeners();
    setupAdvancedFeatures();
    initStampFeatures();

    if (myUser && myUser.name) {
        completeLogin();
    }
};

document.getElementById('save-first-name-btn').addEventListener('click', async () => {
    const inputId = document.getElementById('first-id-input').value.trim();
    const inputName = document.getElementById('first-name-input').value.trim();
    
    if (!inputId || !inputName) {
        showNotification("IDとニックネームの両方を入力してください");
        return;
    }
    if (!/^[a-zA-Z0-9_\-]{3,15}$/.test(inputId)) {
        showNotification("IDは3〜15文字の半角英数字・記号(_, -)のみ使用可能です");
        return;
    }

    if (pendingGoogleUser) {
        try {
            const { data: checkIdData, error: checkError } = await supabaseClient
                .from('users')
                .select('id')
                .eq('user_id', inputId);

            if (checkError) {
                alert("ID確認エラーが発生しました:\n" + checkError.message);
                return;
            }

            if (checkIdData && checkIdData.length > 0) {
                showNotification("❌ そのIDは既に他のユーザーに使用されています！");
                return;
            }

            const payload = {
                id: String(pendingGoogleUser.googleId),
                user_id: inputId,
                name: inputName,
                avatar: pendingGoogleUser.avatar || DEFAULT_AVATAR,
                profile_bg: ""
            };

            const { error: upsertError } = await supabaseClient.from('users').upsert(payload);

            if (upsertError) {
                alert("登録エラー詳細:\n" + JSON.stringify(upsertError, null, 2));
                return;
            }

            myUser = { name: inputName, user_id: inputId, avatar: pendingGoogleUser.avatar || DEFAULT_AVATAR, googleId: pendingGoogleUser.googleId, profileBg: "" };
            document.getElementById('modal-first-name').classList.add('hidden');
            showNotification("アカウントを作成しました！");
            pendingGoogleUser = null;
            completeLogin();
        } catch (err) {
            alert("例外エラーが発生しました: " + err.message);
        }
    }
});

function completeLogin() {
    saveData();
    document.getElementById('my-name-display').innerText = myUser.name;
    document.getElementById('my-id-display').innerText = `ID: ${myUser.user_id}`;
    document.getElementById('my-avatar').src = myUser.avatar || DEFAULT_AVATAR;
    if (myUser.profileBg) document.getElementById('my-profile-bg').style.backgroundImage = `url(${myUser.profileBg})`;

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');

    loadFriendSystemData();
    setupFriendRealtimeSubscription(); 
    setupGlobalMessageSubscription();
}

function setupFriendRealtimeSubscription() {
    if (!myUser) return;
    if (friendRealtimeChannel) supabaseClient.removeChannel(friendRealtimeChannel);

    friendRealtimeChannel = supabaseClient.channel(`public:friends:${myUser.googleId}`);
    friendRealtimeChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => {
            loadFriendSystemData(); 
        })
        .subscribe();
}

function setupGlobalMessageSubscription() {
    if (!myUser) return;
    if (globalMessagesChannel) supabaseClient.removeChannel(globalMessagesChannel);

    globalMessagesChannel = supabaseClient.channel('public:messages:global');
    globalMessagesChannel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const newMsg = payload.new;
            if (!newMsg || newMsg.username === myUser.name) return;

            const roomId = newMsg.channel;
            
            // 現在そのチャット画面を開いている場合は画面内描画で済むため未読カウントは増やさない
            if (activeChatId === roomId) {
                return;
            }

            if (!chats[roomId]) {
                chats[roomId] = {
                    name: newMsg.username || "トーク",
                    isGroup: roomId.startsWith('group_'),
                    unread: 1,
                    avatar: newMsg.avatar || DEFAULT_AVATAR,
                    isHidden: false
                };
            } else {
                chats[roomId].unread = (chats[roomId].unread || 0) + 1;
            }

            saveData();
            updateChatListUI();

            if (!chats[roomId].isMuted && !chats[roomId].isBlocked) {
                const textContent = newMsg.message.startsWith('[STAMP]:') ? "スタンプが届きました" :
                                   newMsg.message.startsWith('[FILE]:') ? "ファイルが届きました" :
                                   newMsg.message;
                const senderDisplayName = chats[roomId].customNickname || chats[roomId].name || newMsg.username;
                sendAppNotification(senderDisplayName, textContent);
            }
        })
        .subscribe();
}

async function addFriendByUid(targetUid, targetName) {
    if (!myUser) return;
    const myUidStr = String(myUser.googleId).trim();
    const targetUidStr = String(targetUid).trim();

    const pair = [myUidStr, targetUidStr].sort();
    const roomId = `chat_${pair[0]}_${pair[1]}`;
    registerChatRoom(roomId, targetName, false, DEFAULT_AVATAR, "", [], false);
    updateChatListUI();

    try {
        await supabaseClient.from('friends').insert([{ sender_uid: myUidStr, receiver_uid: targetUidStr, status: 'active' }]).catch(()=>{});
    } catch(e) {
        console.error("Insert error:", e);
    }

    showNotification(`🎉 ${targetName} と相互フレンドになりました！トークが可能です。`);
    await loadFriendSystemData();
}

async function loadFriendSystemData() {
    if (!myUser) return;
    
    const myUidStr = String(myUser.googleId).trim();

    const { data: mySends, error: sendErr } = await supabaseClient
        .from('friends')
        .select('receiver_uid')
        .eq('sender_uid', myUidStr);

    const { data: myReceives, error: recvErr } = await supabaseClient
        .from('friends')
        .select('sender_uid')
        .eq('receiver_uid', myUidStr);

    if (sendErr || recvErr) {
        console.error("Friends load error:", sendErr, recvErr);
    }

    const sendIds = (mySends || []).map(f => String(f.receiver_uid).trim());
    const receiveIds = (myReceives || []).map(f => String(f.sender_uid).trim());
    
    const uniqueSendIds = [...new Set(sendIds)];
    const uniqueReceiveIds = [...new Set(receiveIds)];

    const mutualIds = uniqueSendIds.filter(id => uniqueReceiveIds.includes(id));
    const pendingSentIds = uniqueSendIds.filter(id => !uniqueReceiveIds.includes(id));
    const pendingReceivedIds = uniqueReceiveIds.filter(id => !uniqueSendIds.includes(id));

    if (mutualIds.length > 0) {
        const { data: usersData } = await supabaseClient
            .from('users')
            .select('id, user_id, name, avatar')
            .in('id', mutualIds);
        if (usersData && usersData.length > 0) activeFriendsList = usersData;
    }

    if (pendingSentIds.length > 0) {
        const { data: pendingUsersData } = await supabaseClient
            .from('users')
            .select('id, user_id, name, avatar')
            .in('id', pendingSentIds);
        if (pendingUsersData && pendingUsersData.length > 0) pendingFriendsList = pendingUsersData;
    }

    let pendingReceivedList = [];
    if (pendingReceivedIds.length > 0) {
        const { data: receivedUsersData } = await supabaseClient
            .from('users')
            .select('id, user_id, name, avatar')
            .in('id', pendingReceivedIds);
        pendingReceivedList = receivedUsersData || [];
    }

    // 既存のチャットルーム（手動追加・ローカル保存・グループチャット）を保持・同期
    activeFriendsList.forEach(f => {
        const pair = [myUidStr, String(f.id).trim()].sort();
        const roomId = `chat_${pair[0]}_${pair[1]}`;
        registerChatRoom(roomId, f.name, false, f.avatar || DEFAULT_AVATAR, "", [], false);
    });

    pendingFriendsList.forEach(f => {
        const pair = [myUidStr, String(f.id).trim()].sort();
        const roomId = `chat_${pair[0]}_${pair[1]}`;
        registerChatRoom(roomId, f.name, false, f.avatar || DEFAULT_AVATAR, "", [], true);
    });

    pendingReceivedList.forEach(f => {
        const pair = [myUidStr, String(f.id).trim()].sort();
        const roomId = `chat_${pair[0]}_${pair[1]}`;
        if (!chats[roomId]) {
            chats[roomId] = {
                name: f.name,
                user_id: f.user_id,
                targetUid: f.id,
                isGroup: false,
                unread: 0,
                avatar: f.avatar || DEFAULT_AVATAR,
                isPendingReceived: true,
                isPending: true,
                isHidden: false
            };
        }
    });

    updateChatListUI();
}

document.getElementById('add-friend-submit').addEventListener('click', async () => {
    const targetIdInput = document.getElementById('friend-id-input').value.trim();
    if (!targetIdInput) return;
    if (targetIdInput === myUser.user_id) { showNotification("自分のIDは登録できません"); return; }

    const { data: targetUser, error: findErr } = await supabaseClient
        .from('users')
        .select('id, name, user_id, avatar')
        .eq('user_id', targetIdInput)
        .maybeSingle();

    if (findErr || !targetUser) {
        showNotification("指定されたIDのユーザーが見つかりません");
        return;
    }

    const myUidStr = String(myUser.googleId).trim();
    const targetUidStr = String(targetUser.id).trim();

    // 1. 即時にローカルリストにチャットルームを登録して描画（リスト非表示を完全防止）
    const pair = [myUidStr, targetUidStr].sort();
    const roomId = `chat_${pair[0]}_${pair[1]}`;
    registerChatRoom(roomId, targetUser.name, false, targetUser.avatar || DEFAULT_AVATAR, "", [], false);

    // 2. Supabase に非同期で挿入
    try {
        await supabaseClient.from('friends').insert([{ sender_uid: myUidStr, receiver_uid: targetUidStr, status: 'active' }]).catch(()=>{});
    } catch(e) {
        console.error("Insert error:", e);
    }

    // 3. 相手の相互登録を確認
    const { data: checkMutual } = await supabaseClient.from('friends')
        .select('id')
        .eq('sender_uid', targetUidStr)
        .eq('receiver_uid', myUidStr);

    if (checkMutual && checkMutual.length > 0) {
        showNotification(`🎉 ${targetUser.name} と相互フレンドになりました！`);
    } else {
        showNotification(`@${targetIdInput} (${targetUser.name}) をフレンドに追加しました！`);
    }

    document.getElementById('modal-add').classList.add('hidden');
    document.getElementById('friend-id-input').value = '';
    
    // 即座にUI更新
    updateChatListUI();
    
    // Supabaseと非同期同期
    loadFriendSystemData();
});

function updateChatListUI(filterQuery = "") {
    const list = document.getElementById('chat-list'); 
    if(!list) return;
    list.innerHTML = ''; 
    let totalUnread = 0;
    
    const query = filterQuery.toLowerCase().trim();

    Object.keys(chats).forEach(roomId => {
        const room = chats[roomId];
        
        if (room.isHidden) return;
        if (query && !(room.customNickname || room.name).toLowerCase().includes(query)) {
            return;
        }

        totalUnread += (room.unread || 0);
        const li = document.createElement('li'); 
        li.className = 'list-item';
        
        li.onclick = () => {
            if (room.isPendingReceived && room.targetUid) {
                addFriendByUid(room.targetUid, room.name);
            }
            openChatRoom(roomId);
        };

        const displayName = room.customNickname || room.name;
        const subText = room.isGroup ? 'グループ' : 'フレンド';

        li.innerHTML = `
            <img src="${room.avatar || DEFAULT_AVATAR}" class="avatar">
            <div class="item-info">
                <div class="item-title">${displayName}</div>
                <div class="item-sub">${subText}</div>
            </div>
            ${room.unread > 0 ? `<span class="badge">${room.unread}</span>` : ''}
        `;
        list.appendChild(li);
    });
    
    const totalBadge = document.getElementById('total-unread'); 
    if(totalBadge) {
        totalBadge.innerText = totalUnread;
        totalBadge.classList.toggle('hidden', totalUnread === 0);
    }
}

function registerChatRoom(roomId, name, isGroup, avatar, bgImage = "", members = [], isPending = false) {
    if (!chats[roomId]) {
        chats[roomId] = { name, isGroup, unread: 0, avatar: avatar || DEFAULT_AVATAR, bgImage, members, isPending, isHidden: false };
    } else {
        chats[roomId].name = name;
        chats[roomId].avatar = avatar || (isGroup ? DEFAULT_GROUP_AVATAR : DEFAULT_AVATAR);
        chats[roomId].isPending = isPending;
        chats[roomId].isPendingReceived = false;
    }
    saveData();
}

async function openChatRoom(roomId) {
    if (currentSubscription) { await supabaseClient.removeChannel(currentSubscription); currentSubscription = null; }
    activeChatId = roomId; const room = chats[roomId]; if(!room) return; room.unread = 0; saveData(); updateChatListUI();
    document.getElementById('chat-target-name').innerText = room.customNickname || room.name;
    document.getElementById('messages').innerHTML = '';
    const chatScreen = document.getElementById('chat-screen');
    chatScreen.style.backgroundImage = room.bgImage ? `url(${room.bgImage})` : 'none';
    document.getElementById('main-screen').classList.add('hidden'); chatScreen.classList.remove('hidden');

    document.getElementById('chat-search-input').value = '';

    const { data: pastMessages, error } = await supabaseClient.from('messages').select('*').eq('channel', roomId).order('created_at', { ascending: true });
    if (!error && pastMessages) pastMessages.forEach(msg => addMessageToScreen(msg));

    currentSubscription = supabaseClient.channel(`room:${roomId}`);
    currentSubscription
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel=eq.${roomId}` }, payload => {
            if (payload.eventType === 'INSERT') {
                if (payload.new.username !== myUser.name) sendAppNotification(payload.new.username, payload.new.message.startsWith('[STAMP]:') ? "スタンプ" : payload.new.message);
                addMessageToScreen(payload.new);
            } else if (payload.eventType === 'DELETE') {
                const elem = document.querySelector(`[data-msg-id="${payload.old.id}"]`); if (elem) elem.remove();
            }
        })
        .on('broadcast', { event: 'call-signal' }, payload => { handleCallSignaling(payload.payload); })
        .subscribe();
}

document.getElementById('back-btn').addEventListener('click', async () => {
    endCallState(); if (currentSubscription) { await supabaseClient.removeChannel(currentSubscription); currentSubscription = null; }
    activeChatId = null; document.getElementById('chat-screen').classList.add('hidden'); document.getElementById('main-screen').classList.remove('hidden');
});

document.getElementById('attach-toggle-btn').addEventListener('click', () => { document.getElementById('attachment-menu').classList.toggle('hidden'); document.getElementById('stamp-picker').classList.add('hidden'); });
document.getElementById('attach-file-trigger').addEventListener('click', () => { document.getElementById('chat-file-input').click(); });
document.getElementById('attach-image-trigger').addEventListener('click', () => { document.getElementById('chat-image-input').click(); });

document.getElementById('chat-file-input').addEventListener('change', async (e) => {
    if (e.target.files.length > 0 && activeChatId) {
        const f = e.target.files[0]; await sendMessageInternal(`[FILE]:${JSON.stringify({ name: f.name, data: await readFileAsBase64(f) })}`);
        document.getElementById('attachment-menu').classList.add('hidden'); e.target.value = '';
    }
});
document.getElementById('chat-image-input').addEventListener('change', async (e) => {
    if (e.target.files.length > 0 && activeChatId) {
        await sendMessageInternal(`[STAMP]:${await resizeImage(await readFileAsBase64(e.target.files[0]), 400, 400)}`);
        document.getElementById('attachment-menu').classList.add('hidden'); e.target.value = '';
    }
});

document.getElementById('chat-menu-btn').addEventListener('click', () => { if (activeChatId) document.getElementById('modal-chat-menu').classList.remove('hidden'); });
document.getElementById('change-bg-file').addEventListener('change', async (e) => {
    if (e.target.files.length > 0 && activeChatId) {
        const bg = await resizeImage(await readFileAsBase64(e.target.files[0]), 300, 300);
        chats[activeChatId].bgImage = bg; saveData(); document.getElementById('chat-screen').style.backgroundImage = `url(${bg})`;
        document.getElementById('modal-chat-menu').classList.add('hidden');
    }
});
document.getElementById('delete-friend-btn').addEventListener('click', async () => {
    if (activeChatId) {
        const room = chats[activeChatId];
        const targetFriend = activeFriendsList.find(f => f.name === room.name);
        if(targetFriend) {
            await supabaseClient.from('friends').delete().eq('sender_uid', myUser.googleId).eq('receiver_uid', targetFriend.id);
        }
    }
    delete chats[activeChatId]; saveData(); loadFriendSystemData(); document.getElementById('back-btn').click(); document.getElementById('modal-chat-menu').classList.add('hidden');
});

document.getElementById('stamp-toggle-btn').addEventListener('click', () => {
    document.getElementById('stamp-picker').classList.toggle('hidden');
    document.getElementById('attachment-menu').classList.add('hidden');
    renderStamps();
});

let currentStampPackId = 'all';

function renderStamps(packId = currentStampPackId) {
    currentStampPackId = packId;
    const list = document.getElementById('stamp-list');
    const tabContainer = document.getElementById('stamp-pack-tabs');
    if (!list) return;

    if (tabContainer) {
        tabContainer.innerHTML = '';
        
        const allTab = document.createElement('button');
        allTab.className = `btn-small ${currentStampPackId === 'all' ? 'btn-primary' : 'btn-secondary'}`;
        allTab.style.whiteSpace = 'nowrap';
        allTab.style.fontSize = '11px';
        allTab.innerText = 'すべて';
        allTab.onclick = () => renderStamps('all');
        tabContainer.appendChild(allTab);

        stampPacks.forEach(pack => {
            const packTab = document.createElement('button');
            packTab.className = `btn-small ${currentStampPackId === pack.id ? 'btn-primary' : 'btn-secondary'}`;
            packTab.style.whiteSpace = 'nowrap';
            packTab.style.fontSize = '11px';
            packTab.innerText = pack.name;
            packTab.onclick = () => renderStamps(pack.id);
            tabContainer.appendChild(packTab);
        });
    }

    let displayStamps = [];
    if (currentStampPackId === 'all') {
        displayStamps = stamps;
    } else {
        const foundPack = stampPacks.find(p => p.id === currentStampPackId);
        displayStamps = foundPack ? (foundPack.stamps || []) : stamps;
    }

    list.innerHTML = '';
    displayStamps.forEach(s => {
        const img = document.createElement('img');
        img.src = s;
        img.className = 'stamp-item';
        img.addEventListener('click', () => {
            sendStamp(s);
        });
        list.appendChild(img);
    });
}

function sendStamp(url) {
    if (!url || !activeChatId) return;
    sendMessageInternal(`[STAMP]:${url}`);
    const picker = document.getElementById('stamp-picker');
    if (picker) picker.classList.add('hidden');
}

async function sendMessageInternal(t) { if (t && activeChatId) await supabaseClient.from('messages').insert([{ channel: activeChatId, username: myUser.name, avatar: myUser.avatar || DEFAULT_AVATAR, message: t }]); }
document.getElementById('send-btn').addEventListener('click', () => { const i = document.getElementById('message-input'); if (i.value.trim()) { sendMessageInternal(i.value.trim()); i.value = ''; document.getElementById('char-counter').innerText = '0 / 500'; } });
document.getElementById('message-input').addEventListener('keypress', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { sendMessageInternal(e.target.value.trim()); e.target.value = ''; document.getElementById('char-counter').innerText = '0 / 500'; } });

let selectedMsgData = null;

function showContextMenu(x, y, msgData) {
    selectedMsgData = msgData;
    const menu = document.getElementById('msg-context-menu');
    if (!menu) return;

    const deleteBtn = document.getElementById('ctx-delete-btn');
    if (deleteBtn) {
        deleteBtn.style.display = (msgData.username === myUser.name) ? 'block' : 'none';
    }

    menu.style.left = `${Math.min(x, window.innerWidth - 140)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 80)}px`;
    menu.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('msg-context-menu');
    if (menu && !menu.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

document.getElementById('ctx-copy-btn').addEventListener('click', () => {
    if (selectedMsgData && selectedMsgData.message) {
        let textToCopy = selectedMsgData.message;
        if (textToCopy.startsWith('[STAMP]:')) textToCopy = "[スタンプ]";
        else if (textToCopy.startsWith('[FILE]:')) textToCopy = "[ファイル]";
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            showNotification("メッセージをコピーしました");
        }).catch(() => {
            showNotification("コピーに失敗しました");
        });
    }
    document.getElementById('msg-context-menu').classList.add('hidden');
});

document.getElementById('ctx-delete-btn').addEventListener('click', async () => {
    if (selectedMsgData && selectedMsgData.id) {
        const { error } = await supabaseClient.from('messages').delete().eq('id', selectedMsgData.id);
        if (error) {
            showNotification("送信取り消しに失敗しました");
        } else {
            showNotification("メッセージの送信を取り消しました");
            const elem = document.querySelector(`[data-msg-id="${selectedMsgData.id}"]`);
            if (elem) elem.remove();
        }
    }
    document.getElementById('msg-context-menu').classList.add('hidden');
});

function attachContextMenu(element, msgData) {
    let pressTimer;
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, msgData);
    });

    element.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            const touch = e.touches[0];
            showContextMenu(touch.clientX, touch.clientY, msgData);
        }, 500);
    });
    element.addEventListener('touchend', () => clearTimeout(pressTimer));
    element.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

function addMessageToScreen(data) {
    const messagesDiv = document.getElementById('messages'); if(!messagesDiv) return;

    if (data.message.startsWith('[GROUP_INFO]:')) {
        try {
            const info = JSON.parse(data.message.replace('[GROUP_INFO]:', ''));
            if (info.members && info.members.includes(myUser.googleId)) {
                registerChatRoom(data.channel, info.name, true, DEFAULT_GROUP_AVATAR, "", info.members, false);
                updateChatListUI();
            }
            const sysMsg = document.createElement('div');
            sysMsg.className = 'system-message';
            sysMsg.innerText = `👥 ${data.username} がグループ「${info.name}」を作成しました`;
            messagesDiv.appendChild(sysMsg);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return;
        } catch(e){}
    }

    const isMe = data.username === myUser.name;
    const group = document.createElement('div'); group.className = `message-group ${isMe ? 'me' : 'other'}`;
    if (data.id) group.setAttribute('data-msg-id', data.id);
    
    attachContextMenu(group, data);

    const avatarImg = document.createElement('img'); avatarImg.className = 'msg-avatar'; 
    avatarImg.src = data.avatar || DEFAULT_AVATAR;

    const content = document.createElement('div'); content.className = 'msg-content';
    if (!isMe) {
        const nameLbl = document.createElement('div'); nameLbl.className = 'msg-username'; nameLbl.innerText = data.username; content.appendChild(nameLbl);
    }
    const wrapper = document.createElement('div'); wrapper.className = 'bubble-wrapper';

    if (data.message.startsWith('[STAMP]:')) {
        const img = document.createElement('img'); img.className = 'stamp-img'; img.src = data.message.replace('[STAMP]:', ''); wrapper.appendChild(img);
    } else if (data.message.startsWith('[FILE]:')) {
        try {
            const f = JSON.parse(data.message.replace('[FILE]:', ''));
            const box = document.createElement('div'); box.className = 'file-bubble'; box.innerHTML = `📄 <b>${f.name}</b><br><a href="${f.data}" download="${f.name}" class="file-dl-link">💾 ダウンロード</a>`;
            wrapper.appendChild(box);
        }catch(e){}
    } else {
        const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerText = data.message;
        bubble.style.backgroundColor = isMe ? appSettings.bubbleColor : (appSettings.theme === 'dark' ? '#333' : '#fff'); 
        bubble.style.color = isMe ? '#fff' : (appSettings.theme === 'dark' ? '#fff' : '#000');
        bubble.style.borderRadius = appSettings.bubbleShape;
        wrapper.appendChild(bubble);
    }
    const timeText = document.createElement('span'); timeText.className = 'time';
    timeText.innerHTML = `${isMe ? '<span class="read-mark">既読 </span>':''}${new Date(data.created_at || Date.now()).getHours().toString().padStart(2,'0')}:${new Date(data.created_at || Date.now()).getMinutes().toString().padStart(2,'0')}`;
    wrapper.appendChild(timeText); content.appendChild(wrapper); group.appendChild(avatarImg); group.appendChild(content); messagesDiv.appendChild(group); messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setupAdvancedFeatures() {
    document.getElementById('font-select').addEventListener('change', (e) => {
        appSettings.font = e.target.value;
        applySettingsUI();
    });

    document.getElementById('theme-select').addEventListener('change', (e) => {
        appSettings.theme = e.target.value;
        applySettingsUI();
    });

    const bubbleColorPicker = document.getElementById('bubble-color-picker');
    if (bubbleColorPicker) {
        bubbleColorPicker.addEventListener('change', (e) => {
            appSettings.bubbleColor = e.target.value;
            saveData();
        });
    }

    const bubbleShapeSelect = document.getElementById('bubble-shape-select');
    if (bubbleShapeSelect) {
        bubbleShapeSelect.addEventListener('change', (e) => {
            appSettings.bubbleShape = e.target.value;
            saveData();
        });
    }

    const msgInput = document.getElementById('message-input');
    const charCounter = document.getElementById('char-counter');
    msgInput.addEventListener('input', () => {
        const len = msgInput.value.length;
        charCounter.innerText = `${len} / 500`;
        charCounter.style.color = len >= 500 ? '#ff4d4f' : '#888';
    });

    document.getElementById('chat-search-input').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const groups = document.querySelectorAll('.message-group');
        groups.forEach(group => {
            const bubble = group.querySelector('.bubble');
            if (bubble) {
                const text = bubble.innerText.toLowerCase();
                group.style.display = text.includes(query) ? 'flex' : 'none';
            }
        });
    });

    document.getElementById('friend-search-input').addEventListener('input', (e) => {
        updateChatListUI(e.target.value);
    });

    document.getElementById('call-audio-btn').addEventListener('click', () => startCall('audio'));
    document.getElementById('call-video-btn').addEventListener('click', () => startCall('video'));
    document.getElementById('accept-call-btn').addEventListener('click', acceptCall);
    document.getElementById('hangup-call-btn').addEventListener('click', hangupCall);

    // デスクトップ通知設定
    const notifBtn = document.getElementById('request-notification-btn');
    if (notifBtn) {
        notifBtn.addEventListener('click', async () => {
            if ("Notification" in window) {
                const perm = await Notification.requestPermission();
                if (perm === "granted") {
                    showNotification("デスクトップ通知が有効化されました");
                } else {
                    showNotification("通知の許可が得られませんでした");
                }
            } else {
                showNotification("このブラウザはデスクトップ通知に対応していません");
            }
        });
    }

    // トーク設定メニューのボタンハンドラー
    document.getElementById('set-nickname-btn').addEventListener('click', () => {
        if (!activeChatId) return;
        const currentNick = chats[activeChatId].customNickname || chats[activeChatId].name;
        const newNick = prompt("あだ名（表示名）を設定してください:", currentNick);
        if (newNick !== null) {
            chats[activeChatId].customNickname = newNick.trim() || null;
            saveData();
            updateChatListUI();
            if (activeChatId) document.getElementById('chat-target-name').innerText = chats[activeChatId].customNickname || chats[activeChatId].name;
            showNotification("あだ名を保存しました");
        }
        document.getElementById('modal-chat-menu').classList.add('hidden');
    });

    document.getElementById('toggle-mute-btn').addEventListener('click', () => {
        if (!activeChatId) return;
        chats[activeChatId].isMuted = !chats[activeChatId].isMuted;
        saveData();
        showNotification(chats[activeChatId].isMuted ? "通知をミュートしました" : "通知ミュートを解除しました");
        document.getElementById('modal-chat-menu').classList.add('hidden');
    });

    document.getElementById('toggle-block-btn').addEventListener('click', () => {
        if (!activeChatId) return;
        chats[activeChatId].isBlocked = !chats[activeChatId].isBlocked;
        saveData();
        showNotification(chats[activeChatId].isBlocked ? "相手をブロックしました" : "ブロックを解除しました");
        document.getElementById('modal-chat-menu').classList.add('hidden');
    });

    document.getElementById('toggle-hide-btn').addEventListener('click', () => {
        if (!activeChatId) return;
        chats[activeChatId].isHidden = true;
        saveData();
        updateChatListUI();
        showNotification("トークを非表示にしました");
        document.getElementById('modal-chat-menu').classList.add('hidden');
        document.getElementById('back-btn').click();
    });
}

document.getElementById('call-layout-btn').addEventListener('click', () => {
    const vc = document.getElementById('video-container'); vc.classList.remove(callLayouts[currentLayoutIndex]);
    currentLayoutIndex = (currentLayoutIndex + 1) % callLayouts.length; vc.classList.add(callLayouts[currentLayoutIndex]);
});
document.getElementById('call-effect-btn').addEventListener('click', () => {
    const lv = document.getElementById('local-video'); lv.classList.remove(videoFilters[currentFilterIndex]);
    currentFilterIndex = (currentFilterIndex + 1) % videoFilters.length; lv.classList.add(videoFilters[currentFilterIndex]);
});

async function handleCallSignaling(p) {
    const { event, from, to, type, sdp, candidate } = p; 
    if (to !== myUser.name) return;

    if (event === 'call-offer') {
        if (callSession.active) { 
            sendSignalingMessage({ event: 'call-rejected', from: myUser.name, to: from }); 
            return; 
        }
        callSession = { active: true, roomId: activeChatId, caller: from, callee: myUser.name, type: type, remoteSdp: sdp };
        showCallModal('incoming');
    } else if (event === 'call-answer' && peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        document.getElementById('call-status').innerText = "通話中";
    } else if (event === 'call-candidate' && peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(()=>{});
    } else if (event === 'call-hangup' || event === 'call-rejected') { 
        endCallState(); 
    }
}

function sendSignalingMessage(d) { 
    if (currentSubscription) currentSubscription.send({ type: 'broadcast', event: 'call-signal', payload: d }); 
}

async function startCall(type) {
    if (!activeChatId || chats[activeChatId].isGroup) return;
    callSession = { active: true, roomId: activeChatId, caller: myUser.name, callee: chats[activeChatId].name, type: type };
    showCallModal('outgoing');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        if (type === 'video') document.getElementById('local-video').srcObject = localStream;
        setupPeerConnection(type);
        const offer = await peerConnection.createOffer(); 
        await peerConnection.setLocalDescription(offer);
        sendSignalingMessage({ event: 'call-offer', from: myUser.name, to: callSession.callee, type: type, sdp: offer });
    } catch (e) { 
        console.error(e);
        hangupCall(); 
    }
}

async function acceptCall() {
    document.getElementById('accept-call-btn').classList.add('hidden');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callSession.type === 'video' });
        if (callSession.type === 'video') document.getElementById('local-video').srcObject = localStream;
        setupPeerConnection(callSession.type);
        if (callSession.remoteSdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(callSession.remoteSdp));
            const ans = await peerConnection.createAnswer(); 
            await peerConnection.setLocalDescription(ans);
            sendSignalingMessage({ event: 'call-answer', from: myUser.name, to: callSession.caller, sdp: ans });
            document.getElementById('call-status').innerText = "通話中";
        }
    } catch (e) { 
        console.error(e);
        hangupCall(); 
    }
}

function setupPeerConnection(type) {
    if(peerConnection) peerConnection.close();
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = (e) => {
        const rv = document.getElementById('remote-video');
        if (rv) { rv.srcObject = e.streams[0] || new MediaStream([e.track]); rv.play().catch(()=>{}); }
    };
    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            const targetUser = (callSession.caller === myUser.name) ? callSession.callee : callSession.caller;
            sendSignalingMessage({ event: 'call-candidate', from: myUser.name, to: targetUser, candidate: e.candidate });
        }
    };
}

function hangupCall() { 
    const targetUser = (callSession.caller === myUser.name) ? callSession.callee : callSession.caller;
    sendSignalingMessage({ event: 'call-hangup', from: myUser.name, to: targetUser }); 
    endCallState(); 
}

function endCallState() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    callSession.active = false; 
    document.getElementById('modal-call').classList.add('hidden');
    document.getElementById('remote-video').srcObject = null; 
    document.getElementById('local-video').srcObject = null;
}

function showCallModal(m) {
    const modal = document.getElementById('modal-call'); 
    document.getElementById('call-target-display').innerText = (callSession.caller === myUser.name) ? callSession.callee : callSession.caller;
    const isV = callSession.type === 'video'; 
    document.getElementById('video-container').classList.toggle('hidden', !isV);
    document.getElementById('call-layout-btn').classList.toggle('hidden', !isV); 
    document.getElementById('call-effect-btn').classList.toggle('hidden', !isV);
    document.getElementById('call-status').innerText = m === 'outgoing' ? '発信中...':'着信';
    document.getElementById('accept-call-btn').classList.toggle('hidden', m !== 'incoming'); 
    modal.classList.remove('hidden');
}

// ヘッダー追加ボタン & グループ作成関連処理
document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('modal-add-choice').classList.remove('hidden');
});

document.getElementById('choice-add-friend-btn').addEventListener('click', () => {
    document.getElementById('modal-add-choice').classList.add('hidden');
    document.getElementById('modal-add').classList.remove('hidden');
});

document.getElementById('choice-create-group-btn').addEventListener('click', () => {
    document.getElementById('modal-add-choice').classList.add('hidden');
    
    const selectList = document.getElementById('group-friends-select-list');
    selectList.innerHTML = '';
    
    if (activeFriendsList.length === 0) {
        selectList.innerHTML = '<p style="font-size:12px; color:#888; text-align:center; padding: 10px 0;">相互フレンドがいません</p>';
    } else {
        activeFriendsList.forEach(f => {
            const item = document.createElement('label');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '8px';
            item.style.margin = '6px 0';
            item.style.fontSize = '13px';
            item.style.cursor = 'pointer';
            item.innerHTML = `
                <input type="checkbox" class="group-friend-checkbox" value="${f.id}">
                <img src="${f.avatar || DEFAULT_AVATAR}" class="avatar" style="width:24px; height:24px;">
                <span>${f.name} (@${f.user_id})</span>
            `;
            selectList.appendChild(item);
        });
    }
    
    document.getElementById('modal-create-group').classList.remove('hidden');
});

document.getElementById('create-group-submit').addEventListener('click', async () => {
    const groupName = document.getElementById('group-name-input').value.trim();
    if (!groupName) {
        showNotification("グループ名を入力してください");
        return;
    }
    
    const checkboxes = document.querySelectorAll('.group-friend-checkbox:checked');
    const selectedMemberIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedMemberIds.length === 0) {
        showNotification("追加するフレンドを選択してください");
        return;
    }

    const members = [myUser.googleId, ...selectedMemberIds];
    const roomId = `group_${Date.now()}`;

    registerChatRoom(roomId, groupName, true, DEFAULT_GROUP_AVATAR, "", members, false);
    
    const payload = {
        name: groupName,
        members: members,
        createdBy: myUser.name
    };

    await sendMessageInternal(`[GROUP_INFO]:${JSON.stringify(payload)}`, roomId);
    
    document.getElementById('modal-create-group').classList.add('hidden');
    document.getElementById('group-name-input').value = '';
    showNotification(`グループ「${groupName}」を作成しました`);
    updateChatListUI();
    openChatRoom(roomId);
});
document.getElementById('story-btn').addEventListener('click', () => { document.getElementById('modal-story').classList.remove('hidden'); renderStories(); });
document.getElementById('post-story-file').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        stories.push({ username: myUser.name, avatar: myUser.avatar, image: await resizeImage(await readFileAsBase64(e.target.files[0]), 300, 400), timestamp: Date.now() });
        saveData(); renderStories(); e.target.value = '';
    }
});
function renderStories() {
    const area = document.getElementById('story-display-area'); const now = Date.now();
    stories = stories.filter(s => (now - s.timestamp) < 86400000); saveData();
    if (stories.length === 0) { area.innerHTML = `<p style="color:#aaa;">投稿はありません</p>`; return; }
    area.innerHTML = stories.map(s => `<div class="story-item"><div class="story-user"><img src="${s.avatar || DEFAULT_AVATAR}" class="msg-avatar"><span>${s.username}</span></div><img src="${s.image}" class="story-img"></div>`).join('');
}

document.getElementById('logout-btn').addEventListener('click', () => {
    endCallState(); 
    if (currentSubscription) { supabaseClient.removeChannel(currentSubscription); currentSubscription = null; }
    if (friendRealtimeChannel) { supabaseClient.removeChannel(friendRealtimeChannel); friendRealtimeChannel = null; }
    if (globalMessagesChannel) { supabaseClient.removeChannel(globalMessagesChannel); globalMessagesChannel = null; }
    document.getElementById('main-screen').classList.add('hidden'); document.getElementById('login-screen').classList.remove('hidden');
});
document.getElementById('settings-btn').addEventListener('click', () => { document.getElementById('modal-settings').classList.remove('hidden'); });
document.querySelectorAll('.closeModal').forEach(btn => { btn.addEventListener('click', (e) => { e.target.closest('.modal').classList.add('hidden'); }); });

function setupFileInputListeners() {
    const pairs = [['edit-avatar-file', 'edit-avatar-name'], ['edit-profile-bg-file', 'edit-bg-name'], ['custom-stamp-file', 'stamp-file-name']];
    pairs.forEach(([inputId, nameId]) => {
        const el = document.getElementById(inputId); const nameEl = document.getElementById(nameId);
        if (el && nameEl) el.addEventListener('change', (e) => { nameEl.innerText = e.target.files.length > 0 ? e.target.files[0].name : "未選択"; });
    });
}

document.getElementById('edit-profile-trigger').addEventListener('click', () => {
    document.getElementById('edit-name-input').value = myUser.name;
    document.getElementById('modal-profile').classList.remove('hidden');
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const newName = document.getElementById('edit-name-input').value.trim();
    const fileInput = document.getElementById('edit-avatar-file');
    const bgFileInput = document.getElementById('edit-profile-bg-file');
    if (newName) myUser.name = newName;
    if (fileInput.files.length > 0) { myUser.avatar = await resizeImage(await readFileAsBase64(fileInput.files[0]), 150, 150); }
    if (bgFileInput.files.length > 0) {
        myUser.profileBg = await resizeImage(await readFileAsBase64(bgFileInput.files[0]), 400, 250);
        document.getElementById('my-profile-bg').style.backgroundImage = `url(${myUser.profileBg})`;
    }
    saveData();
    document.getElementById('my-name-display').innerText = myUser.name;
    document.getElementById('my-avatar').src = myUser.avatar;
    document.getElementById('modal-profile').classList.add('hidden');
    showNotification("プロフィールを更新しました");
});

function normalizeForSearch(str) {
    if (!str) return '';
    const kata = str.replace(/[\u3041-\u3096]/g, m => String.fromCharCode(m.charCodeAt(0) + 0x60));
    return kata.toLowerCase().trim();
}

// ★スタンプ機能拡張（スタンプファイル、ストア、作成、お絵かき）
function initStampFeatures() {
    const stampMgrBtn = document.getElementById('stamp-manager-btn');
    if (stampMgrBtn) {
        stampMgrBtn.addEventListener('click', () => {
            document.getElementById('modal-stamp-manager').classList.remove('hidden');
            renderMyStampPacks();
        });
    }

    const tabMyBtn = document.getElementById('tab-my-stamps-btn');
    const tabPubBtn = document.getElementById('tab-public-stamps-btn');
    const areaMy = document.getElementById('area-my-stamps');
    const areaPub = document.getElementById('area-public-stamps');
    const publicSearchInput = document.getElementById('public-stamp-search-input');
    const clearSearchBtn = document.getElementById('clear-public-search-btn');

    if (tabMyBtn && tabPubBtn) {
        tabMyBtn.addEventListener('click', () => {
            tabMyBtn.classList.replace('btn-secondary', 'btn-primary');
            tabPubBtn.classList.replace('btn-primary', 'btn-secondary');
            areaMy.classList.remove('hidden');
            areaPub.classList.add('hidden');
            renderMyStampPacks();
        });

        tabPubBtn.addEventListener('click', () => {
            tabPubBtn.classList.replace('btn-secondary', 'btn-primary');
            tabMyBtn.classList.replace('btn-primary', 'btn-secondary');
            areaPub.classList.remove('hidden');
            areaMy.classList.add('hidden');
            renderPublicStampPacks(publicSearchInput ? publicSearchInput.value : '');
        });
    }

    const openCreateStampBtn = document.getElementById('open-create-stamp-btn');
    if (openCreateStampBtn) {
        openCreateStampBtn.addEventListener('click', () => {
            document.getElementById('modal-create-stamp').classList.remove('hidden');
            setupCanvasEvents();
        });
    }

    const openCreatePackBtn = document.getElementById('open-create-pack-btn');
    if (openCreatePackBtn) {
        openCreatePackBtn.addEventListener('click', () => {
            openCreatePackModal();
        });
    }

    const modeDrawBtn = document.getElementById('stamp-mode-draw-btn');
    const modeFileBtn = document.getElementById('stamp-mode-file-btn');
    const drawArea = document.getElementById('stamp-draw-area');
    const fileArea = document.getElementById('stamp-file-area');

    if (modeDrawBtn && modeFileBtn) {
        modeDrawBtn.addEventListener('click', () => {
            modeDrawBtn.classList.replace('btn-secondary', 'btn-primary');
            modeFileBtn.classList.replace('btn-primary', 'btn-secondary');
            drawArea.classList.remove('hidden');
            fileArea.classList.add('hidden');
        });
        modeFileBtn.addEventListener('click', () => {
            modeFileBtn.classList.replace('btn-secondary', 'btn-primary');
            modeDrawBtn.classList.replace('btn-primary', 'btn-secondary');
            fileArea.classList.remove('hidden');
            drawArea.classList.add('hidden');
        });
    }

    const saveNewStampBtn = document.getElementById('save-new-stamp-btn');
    if (saveNewStampBtn) {
        saveNewStampBtn.addEventListener('click', async () => {
            const isDrawMode = !drawArea.classList.contains('hidden');
            let stampData = null;

            if (isDrawMode) {
                const canvas = document.getElementById('stamp-canvas');
                stampData = canvas.toDataURL('image/png');
            } else {
                const fileEl = document.getElementById('custom-stamp-file-new');
                if (fileEl.files.length > 0) {
                    stampData = await resizeImage(await readFileAsBase64(fileEl.files[0]), 150, 150);
                }
            }

            if (stampData) {
                stamps.push(stampData);
                saveData();
                showNotification("新しいスタンプを作成しました！");
                document.getElementById('modal-create-stamp').classList.add('hidden');
                renderMyStampPacks();
                renderStamps();
            } else {
                showNotification("スタンプ画像を描くか選択してください");
            }
        });
    }

    const savePackLocalBtn = document.getElementById('save-pack-local-btn');
    if (savePackLocalBtn) {
        savePackLocalBtn.addEventListener('click', () => savePackInternal(false));
    }

    const savePackPubBtn = document.getElementById('save-pack-publish-btn');
    if (savePackPubBtn) {
        savePackPubBtn.addEventListener('click', () => savePackInternal(true));
    }

    if (publicSearchInput) {
        publicSearchInput.addEventListener('input', (e) => {
            renderPublicStampPacks(e.target.value);
        });
    }

    if (clearSearchBtn && publicSearchInput) {
        clearSearchBtn.addEventListener('click', () => {
            publicSearchInput.value = '';
            renderPublicStampPacks('');
            publicSearchInput.focus();
        });
    }
}

function renderMyStampPacks() {
    const list = document.getElementById('my-stamp-packs-list');
    if (!list) return;
    list.innerHTML = '';

    if (!stampPacks || stampPacks.length === 0) {
        list.innerHTML = '<p style="color:#aaa; font-size:12px;">マイスタンプファイルはありません</p>';
        return;
    }

    stampPacks.forEach(pack => {
        const item = document.createElement('div');
        item.style.border = '1px solid #e2e8f0';
        item.style.borderRadius = '8px';
        item.style.padding = '8px';
        item.style.marginBottom = '8px';
        item.style.background = '#fafafa';

        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        title.innerText = `${pack.name} (${(pack.stamps || []).length}個)`;

        const desc = document.createElement('div');
        desc.style.fontSize = '11px';
        desc.style.color = '#666';
        desc.innerText = `${pack.description || ''} | ${pack.price > 0 ? pack.price + '円' : '無料'} ${pack.isPublic ? '🌐公開中' : '🔒非公開'}`;

        const grid = document.createElement('div');
        grid.style.display = 'flex';
        grid.style.gap = '4px';
        grid.style.overflowX = 'auto';
        grid.style.marginTop = '6px';

        (pack.stamps || []).slice(0, 8).forEach(sUrl => {
            const img = document.createElement('img');
            img.src = sUrl;
            img.style.width = '36px';
            img.style.height = '36px';
            img.style.objectFit = 'contain';
            grid.appendChild(img);
        });

        item.appendChild(title);
        item.appendChild(desc);
        item.appendChild(grid);
        list.appendChild(item);
    });
}

async function renderPublicStampPacks(query = "") {
    const list = document.getElementById('public-stamp-packs-list');
    if (!list) return;

    const publicSearchInput = document.getElementById('public-stamp-search-input');
    const clearSearchBtn = document.getElementById('clear-public-search-btn');
    const countBadge = document.getElementById('public-stamp-search-count');

    let publicPacks = [];
    try {
        const { data, error } = await supabaseClient.from('stamp_packs').select('*').order('created_at', { ascending: false });
        if (!error && data) {
            publicPacks = data.map(d => ({
                id: d.id,
                name: d.name,
                description: d.description,
                price: d.price || 0,
                authorName: d.author_name,
                stamps: d.stamps || []
            }));
        }
    } catch(e) { console.error(e); }

    stampPacks.filter(p => p.isPublic).forEach(p => {
        if (!publicPacks.some(pub => pub.name === p.name)) publicPacks.push(p);
    });

    const rawQuery = query !== undefined ? query : (publicSearchInput ? publicSearchInput.value : "");
    if (clearSearchBtn) {
        clearSearchBtn.style.display = rawQuery.trim() ? 'block' : 'none';
    }

    const normQ = normalizeForSearch(rawQuery);
    if (normQ) {
        publicPacks = publicPacks.filter(p => 
            normalizeForSearch(p.name).includes(normQ) ||
            normalizeForSearch(p.description).includes(normQ) ||
            normalizeForSearch(p.authorName).includes(normQ)
        );
    }

    if (countBadge) {
        countBadge.innerText = `${publicPacks.length}件`;
    }

    if (publicPacks.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 20px 10px; color:#94a3b8;"><p style="font-size: 24px; margin-bottom: 4px;">🔍</p><p style="font-size:12px;">${normQ ? '「' + rawQuery + '」に一致するスタンプはありません' : '公開されているスタンプはありません'}</p></div>`;
        return;
    }

    list.innerHTML = '';
    publicPacks.forEach(pack => {
        const card = document.createElement('div');
        card.style.border = '1px solid #cbd5e1';
        card.style.borderRadius = '8px';
        card.style.padding = '10px';
        card.style.marginBottom = '10px';
        card.style.background = '#ffffff';

        card.innerHTML = `
            <div style="font-weight:bold; font-size:14px; color:#1e293b;">${pack.name}</div>
            <div style="font-size:11px; color:#64748b; margin-top:2px;">
                作者: ${pack.authorName || '匿名'} | 価格: <b style="color:${pack.price > 0 ? '#ef4444' : '#10b981'};">${pack.price > 0 ? pack.price + '円' : '無料'}</b>
            </div>
            <div style="font-size:12px; color:#334155; margin-top:4px;">${pack.description || ''}</div>
            <div class="stamp-preview-scroll" style="display:flex; gap:4px; overflow-x:auto; margin:8px 0;">
                ${(pack.stamps || []).map(s => `<img src="${s}" style="width:36px; height:36px; object-fit:contain;">`).join('')}
            </div>
            <button class="btn-small btn-primary add-public-pack-btn" style="width:100%;">このスタンプを新しいファイルとして追加</button>
        `;

        card.querySelector('.add-public-pack-btn').addEventListener('click', () => {
            addPublicPackToMyStamps(pack);
        });

        list.appendChild(card);
    });
}

function addPublicPackToMyStamps(pack) {
    if (pack.price > 0) {
        const ok = confirm(`「${pack.name}」を ${pack.price}円 で購入してファイルに追加しますか？`);
        if (!ok) return;
    }

    const newPack = {
        id: `pack_${Date.now()}`,
        name: pack.name,
        description: pack.description,
        price: pack.price,
        authorName: pack.authorName,
        isPublic: false,
        stamps: pack.stamps || []
    };

    stampPacks.push(newPack);
    (pack.stamps || []).forEach(s => {
        if (!stamps.includes(s)) stamps.push(s);
    });

    saveData();
    showNotification(`🎉 「${pack.name}」をマイスタンプファイルに追加しました！`);
    renderMyStampPacks();
    renderStamps();
}

let isDrawing = false;
let isEraser = false;

function setupCanvasEvents() {
    const canvas = document.getElementById('stamp-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const colorInput = document.getElementById('stamp-pen-color');
    const sizeInput = document.getElementById('stamp-pen-size');
    const eraserBtn = document.getElementById('stamp-eraser-toggle');
    const clearBtn = document.getElementById('stamp-canvas-clear');

    if (clearBtn) {
        clearBtn.onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (eraserBtn) {
        eraserBtn.onclick = () => {
            isEraser = !isEraser;
            eraserBtn.innerText = isEraser ? '🧹 消しゴム中' : '✏️ ペン';
        };
    }

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function startDraw(e) {
        isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!isDrawing) return;
        const pos = getPos(e);
        ctx.lineWidth = sizeInput ? sizeInput.value : 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = colorInput ? colorInput.value : '#000000';
        }

        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }

    function endDraw() {
        isDrawing = false;
        ctx.beginPath();
    }

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = endDraw;
    canvas.ontouchstart = startDraw;
    canvas.ontouchmove = draw;
    canvas.ontouchend = endDraw;
}

function openCreatePackModal() {
    document.getElementById('modal-create-pack').classList.remove('hidden');
    document.getElementById('pack-name-input').value = '';
    document.getElementById('pack-desc-input').value = '';
    document.getElementById('pack-price-input').value = '0';

    const selectGrid = document.getElementById('pack-stamp-select-grid');
    if (!selectGrid) return;
    selectGrid.innerHTML = '';

    stamps.forEach((sUrl, idx) => {
        const wrapper = document.createElement('label');
        wrapper.style.display = 'inline-block';
        wrapper.style.position = 'relative';
        wrapper.style.cursor = 'pointer';

        wrapper.innerHTML = `
            <input type="checkbox" class="pack-stamp-checkbox" value="${idx}" checked style="position:absolute; top:2px; left:2px; z-index:2;">
            <img src="${sUrl}" style="width:40px; height:40px; border:1px solid #ccc; border-radius:4px; object-fit:contain;">
        `;
        selectGrid.appendChild(wrapper);
    });
}

async function savePackInternal(publish = false) {
    const name = document.getElementById('pack-name-input').value.trim();
    const desc = document.getElementById('pack-desc-input').value.trim();
    const price = parseInt(document.getElementById('pack-price-input').value) || 0;

    if (!name) {
        showNotification("ファイル名を入力してください");
        return;
    }

    const checkboxes = document.querySelectorAll('.pack-stamp-checkbox:checked');
    const selectedStamps = Array.from(checkboxes).map(cb => stamps[parseInt(cb.value)]);

    if (selectedStamps.length === 0) {
        showNotification("入れるスタンプを少なくとも1つ選択してください");
        return;
    }

    const newPack = {
        id: `pack_${Date.now()}`,
        name: name,
        description: desc,
        price: price,
        authorName: myUser ? myUser.name : "匿名",
        authorUid: myUser ? myUser.googleId : "",
        isPublic: publish,
        stamps: selectedStamps
    };

    stampPacks.push(newPack);
    saveData();

    if (publish) {
        try {
            await supabaseClient.from('stamp_packs').insert([{
                id: newPack.id,
                name: newPack.name,
                description: newPack.description,
                price: newPack.price,
                author_name: newPack.authorName,
                stamps: newPack.stamps
            }]).catch(()=>{});
        } catch(e){ console.error(e); }
        showNotification(`🎉 「${name}」をみんなのスタンプに公開保存しました！`);
    } else {
        showNotification(`📦 「${name}」を保存しました`);
    }

    document.getElementById('modal-create-pack').classList.add('hidden');
    renderMyStampPacks();
}