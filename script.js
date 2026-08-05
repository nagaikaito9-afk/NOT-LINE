// ★Supabaseの設定
const SUPABASE_URL = "https://snxfgzqvnafsnrqrhgbh.supabase.co";
const SUPABASE_KEY = "sb_publishable_aTck43w4EIMBhdUiz_sqJg_Mohv4YHc";
const GOOGLE_CLIENT_ID = "56462276148-q2n8gpnaphi48gjq7is0i07dtr4ger0v.apps.googleusercontent.com";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 安全な標準アバター画像のインラインSVGデータ
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50' viewBox='0 0 50 50'><rect width='100%25' height='100%25' fill='%23007AFF'/><text x='50%25' y='55%25' font-family='sans-serif' font-size='20' fill='%23ffffff' text-anchor='middle'>👤</text></svg>";

let myUser = JSON.parse(localStorage.getItem('notline_myUser')) || null;
let chatsData = JSON.parse(localStorage.getItem('notline_chats')) || {};
let stories = JSON.parse(localStorage.getItem('notline_stories')) || [];
let appSettings = JSON.parse(localStorage.getItem('notline_settings')) || {
    font: "system-ui",
    bubbleColor: "#3b82f6",
    bubbleShape: "15px"
};
let chats = {};
let activeFriendsList = []; 
let activeRequestsList = []; 
let stamps = JSON.parse(localStorage.getItem('notline_stamps')) || [
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><circle cx='40' cy='40' r='38' fill='%23FFD700'/><circle cx='28' cy='30' r='5' fill='%23333'/><circle cx='52' cy='30' r='5' fill='%23333'/><path d='M25 50 Q40 68 55 50' stroke='%23333' stroke-width='4' fill='none'/></svg>",
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><circle cx='40' cy='40' r='38' fill='%231E90FF'/><circle cx='28' cy='32' r='5' fill='%23fff'/><circle cx='52' cy='32' r='5' fill='%23fff'/><path d='M28 55 Q40 40 52 55' stroke='%23fff' stroke-width='4' fill='none'/></svg>"
];
let activeChatId = null;
let currentSubscription = null;
let selectedMsgTarget = null; 
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
    localStorage.setItem('notline_stories', JSON.stringify(stories));
    localStorage.setItem('notline_settings', JSON.stringify(appSettings));
    
    const chatsToSave = {};
    Object.keys(chats).forEach(id => {
        chatsToSave[id] = {
            name: chats[id].name,
            isGroup: chats[id].isGroup,
            unread: chats[id].unread,
            avatar: chats[id].avatar,
            bgImage: chats[id].bgImage,
            members: chats[id].members || []
        };
    });
    localStorage.setItem('notline_chats', JSON.stringify(chatsToSave));
}

// Supabase DBからログインユーザー情報取得
async function fetchUserFromSupabase(uid) {
    try {
        const { data, error } = await supabaseClient.from('users').select('*').eq('id', uid).single();
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

// Google ログインボタン初期化（リトライ＆エラー防止機能付）
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

    if (myUser && myUser.name) {
        completeLogin();
    }
};

// ユーザー初期ID・名前決定処理
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
        const { error } = await supabaseClient.from('users').insert([{
            id: pendingGoogleUser.googleId,
            user_id: inputId,
            name: inputName,
            avatar: pendingGoogleUser.avatar || DEFAULT_AVATAR,
            profile_bg: ""
        }]);

        if (error) {
            console.error(error);
            showNotification("❌ そのIDは既に他のユーザーに使用されています！");
            return;
        }

        myUser = { name: inputName, user_id: inputId, avatar: pendingGoogleUser.avatar || DEFAULT_AVATAR, googleId: pendingGoogleUser.googleId, profileBg: "" };
        document.getElementById('modal-first-name').classList.add('hidden');
        showNotification("アカウントを作成しました！");
        pendingGoogleUser = null;
        completeLogin();
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

    chats = {};
    Object.keys(chatsData).forEach(roomId => {
        const room = chatsData[roomId];
        registerChatRoom(roomId, room.name, room.isGroup, room.avatar, room.bgImage, room.members);
    });

    loadFriendSystemData();
}

async function loadFriendSystemData() {
    if (!myUser) return;
    
    const { data: acceptedData } = await supabaseClient
        .from('friends')
        .select(`
            id, status,
            sender: sender_uid ( id, user_id, name, avatar ),
            receiver: receiver_uid ( id, user_id, name, avatar )
        `)
        .or(`sender_uid.eq.${myUser.googleId},receiver_uid.eq.${myUser.googleId}`)
        .eq('status', 'accepted');

    if (acceptedData) {
        activeFriendsList = acceptedData.map(row => {
            return row.sender.id === myUser.googleId ? row.receiver : row.sender;
        });
    }

    const { data: pendingData } = await supabaseClient
        .from('friends')
        .select(`
            id,
            sender: sender_uid ( id, user_id, name, avatar )
        `)
        .eq('receiver_uid', myUser.googleId)
        .eq('status', 'pending');

    if (pendingData) {
        activeRequestsList = pendingData;
    }

    renderFriends();
    renderFriendRequests();
    updateChatListUI();
}

// フレンド申請送信
document.getElementById('add-friend-submit').addEventListener('click', async () => {
    const targetIdInput = document.getElementById('friend-id-input').value.trim();
    if (!targetIdInput) return;
    if (targetIdInput === myUser.user_id) { showNotification("自分のIDには申請できません"); return; }

    const { data: targetUser } = await supabaseClient.from('users').select('id').eq('user_id', targetIdInput).single();
    if (!targetUser) {
        showNotification("指定されたIDのユーザーが見つかりません");
        return;
    }

    const { data: existing } = await supabaseClient.from('friends')
        .select('id')
        .or(`and(sender_uid.eq.${myUser.googleId},receiver_uid.eq.${targetUser.id}),and(sender_uid.eq.${targetUser.id},receiver_uid.eq.${myUser.googleId})`);

    if (existing && existing.length > 0) {
        showNotification("既にフレンドであるか、申請手続きが進行中です");
        return;
    }

    await supabaseClient.from('friends').insert([{ sender_uid: myUser.googleId, receiver_uid: targetUser.id, status: 'pending' }]);
    showNotification(`@${targetIdInput} へフレンド申請を送りました！`);
    document.getElementById('modal-add').classList.add('hidden');
    document.getElementById('friend-id-input').value = '';
});

// QRコード模擬スキャン
document.getElementById('simulate-scan-btn').addEventListener('click', () => {
    const scanId = document.getElementById('qr-scan-simulate').value.trim();
    if(!scanId) return;
    document.getElementById('friend-id-input').value = scanId;
    document.getElementById('type-friend-btn').click();
    document.getElementById('qr-scan-simulate').value = '';
});

async function acceptRequest(requestId) {
    await supabaseClient.from('friends').update({ status: 'accepted' }).eq('id', requestId);
    showNotification("フレンド申請を承認しました！");
    loadFriendSystemData();
}

async function rejectRequest(requestId) {
    await supabaseClient.from('friends').delete().eq('id', requestId);
    showNotification("フレンド申請をお断りしました");
    loadFriendSystemData();
}

function renderFriendRequests() {
    const list = document.getElementById('friend-requests-list');
    list.innerHTML = '';
    if (activeRequestsList.length === 0) {
        list.innerHTML = '<li style="padding:10px; font-size:12px; color:#aaa; text-align:center;">届いている申請はありません</li>';
        return;
    }
    activeRequestsList.forEach(req => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.style.cursor = 'default';
        li.innerHTML = `
            <img src="${req.sender.avatar || DEFAULT_AVATAR}" class="avatar">
            <div class="item-info">
                <div class="item-title">${req.sender.name}</div>
                <div class="item-sub">ID: ${req.sender.user_id}</div>
            </div>
            <div style="display:flex; gap:5px;">
                <button class="btn-small" onclick="acceptRequest(${req.id})">承認</button>
                <button class="btn-small" style="background:#ff4d4f;" onclick="rejectRequest(${req.id})">拒否</button>
            </div>
        `;
        list.appendChild(li);
    });
}

function renderFriends() {
    const list = document.getElementById('friend-list'); list.innerHTML = '';
    const sectionTitle = document.querySelector('.friend-list-section h4');
    if(sectionTitle) sectionTitle.innerText = `フレンド (${activeFriendsList.length}人)`;

    if (activeFriendsList.length === 0) {
        list.innerHTML = '<li style="padding:10px; font-size:12px; color:#aaa; text-align:center;">フレンドはいません</li>';
        return;
    }
    activeFriendsList.forEach(f => {
        const li = document.createElement('li'); li.className = 'list-item';
        li.onclick = () => { 
            const pair = [myUser.googleId, f.id].sort(); 
            registerChatRoom(`chat_${pair[0]}_${pair[1]}`, f.name, false, f.avatar || DEFAULT_AVATAR);
            openChatRoom(`chat_${pair[0]}_${pair[1]}`); 
        };
        li.innerHTML = `<img src="${f.avatar || DEFAULT_AVATAR}" class="avatar"><div class="item-info"><div class="item-title">${f.name}</div><div class="item-sub">ID: ${f.user_id}</div></div>`;
        list.appendChild(li);
    });
}

document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('modal-add').classList.remove('hidden');
    document.getElementById('type-friend-btn').click();
    
    const qrContainer = document.getElementById('my-qrcode-container');
    qrContainer.innerHTML = '';
    if(myUser && typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, { text: myUser.user_id, width: 140, height: 140 });
    }
});

document.getElementById('type-friend-btn').addEventListener('click', (e) => activateAddTab('form-add-friend', e.target));
document.getElementById('type-qr-btn').addEventListener('click', (e) => activateAddTab('form-qr-friend', e.target));
document.getElementById('type-group-btn').addEventListener('click', (e) => {
    activateAddTab('form-add-group', e.target);
    const container = document.getElementById('group-member-select');
    container.innerHTML = activeFriendsList.map(f => `<label style="display:block; margin:4px 0;"><input type="checkbox" value="${f.id}"> ${f.name}</label>`).join('');
});

function activateAddTab(formId, targetBtn) {
    document.querySelectorAll('.add-type-selector button').forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');
    document.getElementById('form-add-friend').classList.add('hidden');
    document.getElementById('form-qr-friend').classList.add('hidden');
    document.getElementById('form-add-group').classList.add('hidden');
    document.getElementById(formId).classList.remove('hidden');
}

document.getElementById('create-group-submit').addEventListener('click', () => {
    const groupName = document.getElementById('group-name-input').value.trim();
    if (!groupName) return;
    const checkboxes = document.querySelectorAll('#group-member-select input[type="checkbox"]:checked');
    const selectedMembers = [myUser.googleId]; checkboxes.forEach(cb => selectedMembers.push(cb.value));
    const roomId = `group_${Date.now()}`;
    registerChatRoom(roomId, groupName, true, `https://api.dicebear.com/7.x/identicon/svg?seed=${groupName}`, "", selectedMembers);
    showNotification(`グループ「${groupName}」を作成しました`);
    document.getElementById('modal-add').classList.add('hidden');
});

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
    endCallState(); if (currentSubscription) { supabaseClient.removeChannel(currentSubscription); currentSubscription = null; }
    document.getElementById('main-screen').classList.add('hidden'); document.getElementById('login-screen').classList.remove('hidden');
});
document.getElementById('settings-btn').addEventListener('click', () => { document.getElementById('modal-settings').classList.remove('hidden'); });
document.querySelectorAll('.closeModal').forEach(btn => { btn.addEventListener('click', (e) => { e.target.closest('.modal').classList.add('hidden'); }); });

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active'); document.getElementById(btn.dataset.tab).classList.add('active');
        document.getElementById('header-title').innerText = btn.dataset.tab === 'tab-chats' ? 'トーク' : 'フレンド';
        if(btn.dataset.tab === 'tab-friends') loadFriendSystemData();
    });
});

function registerChatRoom(roomId, name, isGroup, avatar, bgImage = "", members = []) {
    if (chats[roomId]) return; chats[roomId] = { name, isGroup, unread: 0, avatar: avatar || DEFAULT_AVATAR, bgImage, members }; saveData();
}

async function openChatRoom(roomId) {
    if (currentSubscription) { await supabaseClient.removeChannel(currentSubscription); currentSubscription = null; }
    activeChatId = roomId; const room = chats[roomId]; if(!room) return; room.unread = 0; updateChatListUI();
    document.getElementById('chat-target-name').innerText = room.name;
    document.getElementById('messages').innerHTML = '';
    const chatScreen = document.getElementById('chat-screen');
    chatScreen.style.backgroundImage = room.bgImage ? `url(${room.bgImage})` : 'none';
    document.getElementById('main-screen').classList.add('hidden'); chatScreen.classList.remove('hidden');

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

function updateChatListUI() {
    const list = document.getElementById('chat-list'); list.innerHTML = ''; let totalUnread = 0;
    Object.keys(chats).forEach(roomId => {
        const room = chats[roomId]; totalUnread += room.unread;
        const li = document.createElement('li'); li.className = 'list-item';
        li.onclick = () => openChatRoom(roomId);
        li.innerHTML = `<img src="${room.avatar || DEFAULT_AVATAR}" class="avatar"><div class="item-info"><div class="item-title">${room.name}</div><div class="item-sub">${room.isGroup ? 'グループ':'1対1'}</div></div>`;
        list.appendChild(li);
    });
    const totalBadge = document.getElementById('total-unread'); totalBadge.innerText = totalUnread;
    totalBadge.classList.toggle('hidden', totalUnread === 0);
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
document.getElementById('delete-friend-btn').addEventListener('click', () => { delete chats[activeChatId]; saveData(); updateChatListUI(); document.getElementById('back-btn').click(); document.getElementById('modal-chat-menu').classList.add('hidden'); });

document.getElementById('stamp-toggle-btn').addEventListener('click', () => { document.getElementById('stamp-picker').classList.toggle('hidden'); document.getElementById('attachment-menu').classList.add('hidden'); renderStamps(); });
function renderStamps() { document.getElementById('stamp-list').innerHTML = stamps.map(s => `<img src="${s}" class="stamp-item" onclick="sendStamp('${s}')">`).join(''); }
function sendStamp(url) { sendMessageInternal(`[STAMP]:${url}`); document.getElementById('stamp-picker').classList.add('hidden'); }

document.getElementById('add-custom-stamp-trigger').addEventListener('click', () => { document.getElementById('modal-custom-stamp').classList.remove('hidden'); });
document.getElementById('save-custom-stamp-btn').addEventListener('click', async () => {
    const f = document.getElementById('custom-stamp-file');
    if (f.files.length > 0) { stamps.push(await resizeImage(await readFileAsBase64(f.files[0]), 120, 120)); saveData(); renderStamps(); document.getElementById('modal-custom-stamp').classList.add('hidden'); }
});

async function sendMessageInternal(t) { if (t && activeChatId) await supabaseClient.from('messages').insert([{ channel: activeChatId, username: myUser.name, avatar: myUser.avatar || DEFAULT_AVATAR, message: t }]); }
document.getElementById('send-btn').addEventListener('click', () => { const i = document.getElementById('message-input'); if (i.value.trim()) { sendMessageInternal(i.value.trim()); i.value = ''; } });
document.getElementById('message-input').addEventListener('keypress', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { sendMessageInternal(e.target.value.trim()); e.target.value = ''; } });

function addMessageToScreen(data) {
    const messagesDiv = document.getElementById('messages'); if(!messagesDiv) return;
    const isMe = data.username === myUser.name;
    const group = document.createElement('div'); group.className = `message-group ${isMe ? 'me':'other'}`;
    if (data.id) group.setAttribute('data-msg-id', data.id);
    
    // 安全なSVG画像フォールバック設定
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
        bubble.style.backgroundColor = isMe ? appSettings.bubbleColor : '#fff'; bubble.style.borderRadius = appSettings.bubbleShape;
        wrapper.appendChild(bubble);
    }
    const timeText = document.createElement('span'); timeText.className = 'time';
    timeText.innerHTML = `${isMe ? '<span class="read-mark">既読 </span>':''}${new Date(data.created_at || Date.now()).getHours().toString().padStart(2,'0')}:${new Date(data.created_at || Date.now()).getMinutes().toString().padStart(2,'0')}`;
    wrapper.appendChild(timeText); content.appendChild(wrapper); group.appendChild(avatarImg); group.appendChild(content); messagesDiv.appendChild(group); messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 通話制御
document.getElementById('call-layout-btn').addEventListener('click', () => {
    const vc = document.getElementById('video-container'); vc.classList.remove(callLayouts[currentLayoutIndex]);
    currentLayoutIndex = (currentLayoutIndex + 1) % callLayouts.length; vc.classList.add(callLayouts[currentLayoutIndex]);
});
document.getElementById('call-effect-btn').addEventListener('click', () => {
    const lv = document.getElementById('local-video'); lv.classList.remove(videoFilters[currentFilterIndex]);
    currentFilterIndex = (currentFilterIndex + 1) % videoFilters.length; lv.classList.add(videoFilters[currentFilterIndex]);
});

async function handleCallSignaling(p) {
    const { event, from, to, type, sdp, candidate } = p; if (to !== myUser.name) return;
    if (event === 'call-offer') {
        if (callSession.active) { sendSignalingMessage({ event: 'call-rejected', from: myUser.name, to: from }); return; }
        callSession = { active: true, roomId: activeChatId, caller: from, callee: myUser.name, type: type, remoteSdp: sdp };
        showCallModal('incoming');
    } else if (event === 'call-answer' && peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        document.getElementById('call-status').innerText = "通話中";
    } else if (event === 'call-candidate' && peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(()=>{});
    } else if (event === 'call-hangup' || event === 'call-rejected') { endCallState(); }
}

function sendSignalingMessage(d) { if (currentSubscription) currentSubscription.send({ type: 'broadcast', event: 'call-signal', payload: d }); }

async function startCall(type) {
    if (!activeChatId || chats[activeChatId].isGroup) return;
    callSession = { active: true, roomId: activeChatId, caller: myUser.name, callee: chats[activeChatId].name, type: type };
    showCallModal('outgoing');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        if (type === 'video') document.getElementById('local-video').srcObject = localStream;
        setupPeerConnection(type);
        const offer = await peerConnection.createOffer(); await peerConnection.setLocalDescription(offer);
        sendSignalingMessage({ event: 'call-offer', from: myUser.name, to: callSession.callee, type: type, sdp: offer });
    } catch (e) { hangupCall(); }
}

async function acceptCall() {
    document.getElementById('accept-call-btn').classList.add('hidden');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callSession.type === 'video' });
        if (callSession.type === 'video') document.getElementById('local-video').srcObject = localStream;
        setupPeerConnection(callSession.type);
        if (callSession.remoteSdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(callSession.remoteSdp));
            const ans = await peerConnection.createAnswer(); await peerConnection.setLocalDescription(ans);
            sendSignalingMessage({ event: 'call-answer', from: myUser.name, to: callSession.caller, sdp: ans });
            document.getElementById('call-status').innerText = "通話中";
        }
    } catch (e) { hangupCall(); }
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
        if (e.candidate) sendSignalingMessage({ event: 'call-candidate', from: myUser.name, to: (callSession.caller === myUser.name)? callSession.callee : callSession.caller, candidate: e.candidate });
    };
}
function hangupCall() { sendSignalingMessage({ event: 'call-hangup', from: myUser.name, to: (callSession.caller === myUser.name)? callSession.callee : callSession.caller }); endCallState(); }
function endCallState() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peerConnection) peerConnection.close();
    callSession.active = false; document.getElementById('modal-call').classList.add('hidden');
    document.getElementById('remote-video').srcObject = null; document.getElementById('local-video').srcObject = null;
}
function showCallModal(m) {
    const modal = document.getElementById('modal-call'); document.getElementById('call-target-display').innerText = (callSession.caller === myUser.name)? callSession.callee : callSession.caller;
    const isV = callSession.type === 'video'; document.getElementById('video-container').classList.toggle('hidden', !isV);
    document.getElementById('call-layout-btn').classList.toggle('hidden', !isV); document.getElementById('call-effect-btn').classList.toggle('hidden', !isV);
    document.getElementById('call-status').innerText = m === 'outgoing' ? '発信中...':'着信';
    document.getElementById('accept-call-btn').classList.toggle('hidden', m !== 'incoming'); modal.classList.remove('hidden');
}