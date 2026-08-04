// ★Supabaseの設定
const SUPABASE_URL = "https://snxfgzqvnafsnrqrhgbh.supabase.co";
const SUPABASE_KEY = "sb_publishable_aTck43w4EIMBhdUiz_sqJg_Mohv4YHc";
const GOOGLE_CLIENT_ID = "56462276148-q2n8gpnaphi48gjq7is0i07dtr4ger0v.apps.googleusercontent.com";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let myUser = JSON.parse(localStorage.getItem('notline_myUser')) || null;
let friends = JSON.parse(localStorage.getItem('notline_friends')) || {};
let chatsData = JSON.parse(localStorage.getItem('notline_chats')) || {};
let stories = JSON.parse(localStorage.getItem('notline_stories')) || [];
let appSettings = JSON.parse(localStorage.getItem('notline_settings')) || {
    font: "system-ui",
    bubbleColor: "#85E249",
    bubbleShape: "15px"
};
let chats = {};
let stamps = JSON.parse(localStorage.getItem('notline_stamps')) || [
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=happy",
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=sad",
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=love",
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=cool"
];
let activeChatId = null;
let currentSubscription = null;
let selectedMsgTarget = null; // コンテキストメニュー対象
let pendingGoogleUser = null; // 初回ログイン一時保持用

// WebRTC / 通話機能用の変数
let localStream = null;
let peerConnection = null;
let callSession = {
    active: false,
    roomId: null,
    caller: null,
    callee: null,
    type: 'audio'
};
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function saveData() {
    if (myUser) localStorage.setItem('notline_myUser', JSON.stringify(myUser));
    localStorage.setItem('notline_friends', JSON.stringify(friends));
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

function sendAppNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, { body: body, icon: myUser ? myUser.avatar : "" });
    }
    showNotification(`${title}: ${body}`);
}

function showNotification(msg) {
    let toast = document.getElementById('toast-notification') || document.createElement('div');
    toast.id = 'toast-notification';
    document.getElementById('app-container').appendChild(toast);
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
            let width = img.width;
            let height = img.height;

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
    });
}

function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

function handleCredentialResponse(response) {
    const userData = parseJwt(response.credential);
    const googleId = userData.sub;

    if (myUser && myUser.googleId === googleId) {
        completeLogin(myUser.name, myUser.avatar, googleId, myUser.profileBg);
        showNotification(`${myUser.name} としてログインしたよ！`);
    } else {
        pendingGoogleUser = {
            googleId: googleId,
            defaultName: userData.name,
            avatar: userData.picture
        };
        document.getElementById('first-name-input').value = userData.name;
        document.getElementById('modal-first-name').classList.remove('hidden');
    }
}

document.getElementById('save-first-name-btn').addEventListener('click', () => {
    const inputName = document.getElementById('first-name-input').value.trim();
    if (!inputName) {
        showNotification("名前を入力してください！");
        return;
    }
    if (pendingGoogleUser) {
        completeLogin(inputName, pendingGoogleUser.avatar, pendingGoogleUser.googleId, "");
        document.getElementById('modal-first-name').classList.add('hidden');
        showNotification(`${inputName} として登録したよ！`);
        pendingGoogleUser = null;
    }
});

function initGoogleLogin() {
    if (typeof google !== 'undefined') {
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse });
        google.accounts.id.renderButton(document.getElementById("google-btn-container"), { theme: "outline", size: "large", width: "250" });
    } else {
        setTimeout(initGoogleLogin, 300);
    }
}

function setupFileInputListeners() {
    const pairs = [
        ['edit-avatar-file', 'edit-avatar-name'],
        ['edit-profile-bg-file', 'edit-bg-name'],
        ['friend-avatar-file', 'friend-avatar-name'],
        ['custom-stamp-file', 'stamp-file-name']
    ];
    pairs.forEach(([inputId, nameId]) => {
        const el = document.getElementById(inputId);
        const nameEl = document.getElementById(nameId);
        if (el && nameEl) {
            el.addEventListener('change', (e) => {
                nameEl.innerText = e.target.files.length > 0 ? e.target.files[0].name : "未選択";
            });
        }
    });
}

window.onload = function () {
    initGoogleLogin();
    applySettingsUI();
    setupFileInputListeners();

    document.getElementById('font-select').value = appSettings.font;
    document.getElementById('bubble-color-picker').value = appSettings.bubbleColor;
    document.getElementById('bubble-shape-select').value = appSettings.bubbleShape;

    if (myUser && myUser.name) {
        completeLogin(myUser.name, myUser.avatar, myUser.googleId, myUser.profileBg);
    }
};

function completeLogin(username, avatarUrl, googleId = "", profileBg = "") {
    if (!myUser || myUser.googleId !== googleId) {
        myUser = { name: username, avatar: avatarUrl, googleId: googleId, profileBg: profileBg };
    } else {
        myUser.avatar = avatarUrl || myUser.avatar;
    }
    saveData();

    document.getElementById('my-name-display').innerText = myUser.name;
    document.getElementById('my-avatar').src = myUser.avatar;
    if (myUser.profileBg) {
        document.getElementById('my-profile-bg').style.backgroundImage = `url(${myUser.profileBg})`;
    }
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');

    chats = {};
    Object.keys(chatsData).forEach(roomId => {
        const room = chatsData[roomId];
        registerChatRoom(roomId, room.name, room.isGroup, room.avatar, room.bgImage, room.members);
    });

    renderFriends();
    updateChatListUI();
}

document.getElementById('request-notification-btn').addEventListener('click', () => {
    if (!("Notification" in window)) { showNotification("非対応ブラウザです"); return; }
    Notification.requestPermission().then(permission => {
        if (permission === "granted") sendAppNotification("Messaging app", "通知が有効になりました！🎉");
    });
});

document.getElementById('font-select').addEventListener('change', (e) => { appSettings.font = e.target.value; applySettingsUI(); });
document.getElementById('bubble-color-picker').addEventListener('change', (e) => { appSettings.bubbleColor = e.target.value; saveData(); });
document.getElementById('bubble-shape-select').addEventListener('change', (e) => { appSettings.bubbleShape = e.target.value; saveData(); });

document.getElementById('edit-profile-trigger').addEventListener('click', () => {
    document.getElementById('edit-name-input').value = myUser.name;
    document.getElementById('modal-profile').classList.remove('hidden');
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const newName = document.getElementById('edit-name-input').value.trim();
    const fileInput = document.getElementById('edit-avatar-file');
    const bgFileInput = document.getElementById('edit-profile-bg-file');

    if (newName) myUser.name = newName;
    if (fileInput.files.length > 0) {
        const rawBase64 = await readFileAsBase64(fileInput.files[0]);
        myUser.avatar = await resizeImage(rawBase64, 150, 150);
    }
    if (bgFileInput.files.length > 0) {
        const rawBgBase64 = await readFileAsBase64(bgFileInput.files[0]);
        myUser.profileBg = await resizeImage(rawBgBase64, 400, 250);
        document.getElementById('my-profile-bg').style.backgroundImage = `url(${myUser.profileBg})`;
    }
    saveData();
    document.getElementById('my-name-display').innerText = myUser.name;
    document.getElementById('my-avatar').src = myUser.avatar;
    document.getElementById('modal-profile').classList.add('hidden');
    showNotification("プロフィールを更新したよ！");
});

document.getElementById('story-btn').addEventListener('click', () => {
    document.getElementById('modal-story').classList.remove('hidden');
    renderStories();
});

document.getElementById('post-story-file').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const rawBase64 = await readFileAsBase64(e.target.files[0]);
        const compressed = await resizeImage(rawBase64, 300, 400);
        stories.push({ username: myUser.name, avatar: myUser.avatar, image: compressed, timestamp: Date.now() });
        saveData();
        renderStories();
        showNotification("ストーリーを投稿したよ！");
        e.target.value = '';
    }
});

function renderStories() {
    const area = document.getElementById('story-display-area');
    const now = Date.now();
    stories = stories.filter(s => (now - s.timestamp) < 86400000);
    saveData();
    if (stories.length === 0) {
        area.innerHTML = `<p style="color:#aaa;">投稿されたストーリーはありません（24時間で消えるよ）</p>`;
        return;
    }
    area.innerHTML = stories.map(s => `
        <div class="story-item">
            <div class="story-user"><img src="${s.avatar}" class="msg-avatar"><span>${s.username}</span></div>
            <img src="${s.image}" class="story-img">
        </div>
    `).join('');
}

document.getElementById('logout-btn').addEventListener('click', () => {
    document.getElementById('main-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
});

document.getElementById('settings-btn').addEventListener('click', () => { document.getElementById('modal-settings').classList.remove('hidden'); });

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        document.getElementById('header-title').innerText = btn.dataset.tab === 'tab-chats' ? 'トーク' : 'フレンド';
    });
});

document.getElementById('add-btn').addEventListener('click', () => { document.getElementById('modal-add').classList.remove('hidden'); });
document.querySelectorAll('.closeModal').forEach(btn => { btn.addEventListener('click', (e) => { e.target.closest('.modal').classList.add('hidden'); }); });

document.getElementById('type-friend-btn').addEventListener('click', (e) => {
    e.target.classList.add('active'); document.getElementById('type-group-btn').classList.remove('active');
    document.getElementById('form-add-friend').classList.remove('hidden'); document.getElementById('form-add-group').classList.add('hidden');
});

document.getElementById('type-group-btn').addEventListener('click', (e) => {
    e.target.classList.add('active'); document.getElementById('type-friend-btn').classList.remove('active');
    document.getElementById('form-add-friend').classList.remove('hidden'); document.getElementById('form-add-group').classList.remove('hidden');
    const container = document.getElementById('group-member-select');
    container.innerHTML = Object.keys(friends).map(id => `<label style="display:block; margin:4px 0;"><input type="checkbox" value="${id}"> ${friends[id].nickname || friends[id].name}</label>`).join('');
});

document.getElementById('add-friend-submit').addEventListener('click', async () => {
    const friendName = document.getElementById('friend-id-input').value.trim();
    const nickname = document.getElementById('friend-nickname-input').value.trim();
    const fileInput = document.getElementById('friend-avatar-file');

    if (!friendName) { showNotification("相手の名前を入力してね！"); return; }
    if (friendName === myUser.name) { showNotification("自分自身は追加できないよ！"); return; }

    let finalAvatar = "https://api.dicebear.com/7.x/bottts/svg?seed=" + friendName;
    if (fileInput.files.length > 0) {
        const raw = await readFileAsBase64(fileInput.files[0]);
        finalAvatar = await resizeImage(raw, 150, 150);
    }

    if (!friends[friendName]) {
        friends[friendName] = { name: friendName, nickname: nickname, avatar: finalAvatar, isMuted: false, isBlocked: false, isHidden: false };
        saveData();
        renderFriends();
        
        const pair = [myUser.name, friendName].sort();
        registerChatRoom(`chat_${pair[0]}_${pair[1]}`, friendName, false, finalAvatar);
        showNotification(`${friendName} を追加したよ！`);
    } else {
        showNotification("すでに追加されているよ！");
    }
    document.getElementById('modal-add').classList.add('hidden');
    document.getElementById('friend-id-input').value = '';
    document.getElementById('friend-nickname-input').value = '';
    fileInput.value = '';
});

document.getElementById('create-group-submit').addEventListener('click', () => {
    const groupName = document.getElementById('group-name-input').value.trim();
    if (!groupName) { showNotification("グループ名を入力してね"); return; }
    
    const checkboxes = document.querySelectorAll('#group-member-select input[type="checkbox"]:checked');
    const selectedMembers = [myUser.name];
    checkboxes.forEach(cb => selectedMembers.push(cb.value));

    const roomId = `group_${Date.now()}`;
    registerChatRoom(roomId, groupName, true, `https://api.dicebear.com/7.x/identicon/svg?seed=${groupName}`, "", selectedMembers);
    showNotification(`グループ「${groupName}」を作成したよ！`);
    document.getElementById('modal-add').classList.add('hidden');
    document.getElementById('group-name-input').value = '';
});

function registerChatRoom(roomId, name, isGroup, avatar, bgImage = "", members = []) {
    if (chats[roomId]) return;
    chats[roomId] = { name, isGroup, unread: 0, avatar, bgImage, members };
    saveData();
    updateChatListUI();
}

async function openChatRoom(roomId) {
    activeChatId = roomId;
    const room = chats[roomId];
    room.unread = 0;
    updateChatListUI();

    const targetName = (friends[room.name] && friends[room.name].nickname) ? friends[room.name].nickname : room.name;
    document.getElementById('chat-target-name').innerText = targetName;
    document.getElementById('messages').innerHTML = '';
    
    const chatScreen = document.getElementById('chat-screen');
    chatScreen.style.backgroundImage = room.bgImage ? `url(${room.bgImage})` : 'none';
    document.getElementById('main-screen').classList.add('hidden');
    chatScreen.classList.remove('hidden');

    const { data: pastMessages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('channel', roomId)
        .order('created_at', { ascending: true });

    if (!error && pastMessages) {
        pastMessages.forEach(msg => addMessageToScreen(msg));
    }

    if (currentSubscription) { supabaseClient.removeChannel(currentSubscription); }

    currentSubscription = supabaseClient
        .channel(`room:${roomId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel=eq.${roomId}` }, payload => {
            if (payload.eventType === 'INSERT') {
                const newMsg = payload.new;
                if (friends[newMsg.username] && friends[newMsg.username].isBlocked) return;

                if (newMsg.message.startsWith('[SYSTEM_BG]:')) {
                    const bgData = newMsg.message.replace('[SYSTEM_BG]:', '');
                    chats[roomId].bgImage = bgData;
                    saveData();
                    document.getElementById('chat-screen').style.backgroundImage = `url(${bgData})`;
                    return;
                }

                if (newMsg.username !== myUser.name) {
                    sendAppNotification(newMsg.username, newMsg.message.startsWith('[STAMP]:') ? "スタンプが届きました" : newMsg.message);
                }
                addMessageToScreen(newMsg);
            } else if (payload.eventType === 'DELETE') {
                const deletedElem = document.querySelector(`[data-msg-id="${payload.old.id}"]`);
                if (deletedElem) deletedElem.remove();
            }
        })
        .on('broadcast', { event: 'call-signal' }, payload => {
            handleCallSignaling(payload.payload);
        })
        .subscribe();
}

function renderFriends() {
    const list = document.getElementById('friend-list'); list.innerHTML = '';
    Object.keys(friends).forEach(id => {
        const f = friends[id]; if (f.isHidden || f.isBlocked) return;
        const displayName = f.nickname ? `${f.nickname} (${f.name})` : f.name;
        const li = document.createElement('li'); li.className = 'list-item';
        li.onclick = () => { const pair = [myUser.name, f.name].sort(); openChatRoom(`chat_${pair[0]}_${pair[1]}`); };
        li.innerHTML = `<img src="${f.avatar}" class="avatar"><div class="item-info"><div class="item-title">${displayName}</div></div>`;
        list.appendChild(li);
    });
}

function updateChatListUI() {
    const list = document.getElementById('chat-list'); list.innerHTML = ''; let totalUnread = 0;
    Object.keys(chats).forEach(roomId => {
        const room = chats[roomId]; totalUnread += room.unread;
        const li = document.createElement('li'); li.className = 'list-item';
        li.onclick = () => openChatRoom(roomId);
        li.innerHTML = `<img src="${room.avatar}" class="avatar"><div class="item-info"><div class="item-title">${room.name}</div><div class="item-sub">${room.isGroup ? 'グループ (' + (room.members ? room.members.length : 1) + '人)' : '1対1トーク'}</div></div><span class="badge ${room.unread === 0 ? 'hidden' : ''}">${room.unread}</span>`;
        list.appendChild(li);
    });
    const totalBadge = document.getElementById('total-unread'); totalBadge.innerText = totalUnread;
    totalBadge.classList.toggle('hidden', totalUnread === 0);
}

document.getElementById('back-btn').addEventListener('click', () => {
    if (currentSubscription) supabaseClient.removeChannel(currentSubscription);
    activeChatId = null;
    document.getElementById('chat-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
});

document.getElementById('attach-toggle-btn').addEventListener('click', () => {
    document.getElementById('attachment-menu').classList.toggle('hidden');
    document.getElementById('stamp-picker').classList.add('hidden');
});

document.getElementById('attach-file-trigger').addEventListener('click', () => {
    document.getElementById('chat-file-input').click();
});
document.getElementById('attach-image-trigger').addEventListener('click', () => {
    document.getElementById('chat-image-input').click();
});

document.getElementById('chat-file-input').addEventListener('change', async (e) => {
    if (e.target.files.length > 0 && activeChatId) {
        const file = e.target.files[0];
        const rawBase64 = await readFileAsBase64(file);
        const payload = JSON.stringify({ name: file.name, data: rawBase64 });
        await sendMessageInternal(`[FILE]:${payload}`);
        document.getElementById('attachment-menu').classList.add('hidden');
        e.target.value = '';
    }
});

document.getElementById('chat-image-input').addEventListener('change', async (e) => {
    if (e.target.files.length > 0 && activeChatId) {
        const file = e.target.files[0];
        const rawBase64 = await readFileAsBase64(file);
        const compressed = await resizeImage(rawBase64, 400, 400);
        await sendMessageInternal(`[STAMP]:${compressed}`);
        document.getElementById('attachment-menu').classList.add('hidden');
        e.target.value = '';
    }
});

document.getElementById('chat-menu-btn').addEventListener('click', () => { if (activeChatId) document.getElementById('modal-chat-menu').classList.remove('hidden'); });

document.getElementById('change-bg-file').addEventListener('change', async (e) => {
    if (e.target.files.length > 0 && activeChatId) {
        const rawBase64 = await readFileAsBase64(e.target.files[0]);
        const compressedBase64 = await resizeImage(rawBase64, 300, 300);
        chats[activeChatId].bgImage = compressedBase64;
        saveData();
        document.getElementById('chat-screen').style.backgroundImage = `url(${compressedBase64})`;
        await sendMessageInternal(`[SYSTEM_BG]:${compressedBase64}`);
        showNotification("トークの壁紙を同期したよ！");
        document.getElementById('modal-chat-menu').classList.add('hidden');
    }
});

document.getElementById('set-nickname-btn').addEventListener('click', () => {
    const room = chats[activeChatId];
    if (room.isGroup) { showNotification("グループにあだ名はつけられないよ"); return; }
    const newNick = prompt(`${room.name} の新しいあだ名を入力してね：`);
    if (newNick !== null) {
        if (!friends[room.name]) { friends[room.name] = { name: room.name, avatar: room.avatar }; }
        friends[room.name].nickname = newNick.trim();
        saveData();
        document.getElementById('chat-target-name').innerText = newNick.trim() || room.name;
        renderFriends();
        showNotification("あだ名を変更したよ！");
        document.getElementById('modal-chat-menu').classList.add('hidden');
    }
});

document.getElementById('toggle-mute-btn').addEventListener('click', () => { const room = chats[activeChatId]; if (friends[room.name]) { friends[room.name].isMuted = !friends[room.name].isMuted; saveData(); showNotification(friends[room.name].isMuted ? "ミュートにしたよ" : "ミュート解除したよ"); } document.getElementById('modal-chat-menu').classList.add('hidden'); });
document.getElementById('toggle-block-btn').addEventListener('click', () => { const room = chats[activeChatId]; if (friends[room.name]) { friends[room.name].isBlocked = !friends[room.name].isBlocked; saveData(); showNotification(friends[room.name].isBlocked ? "ブロックしたよ" : "ブロック解除したよ"); renderFriends(); } document.getElementById('modal-chat-menu').classList.add('hidden'); document.getElementById('back-btn').click(); });
document.getElementById('toggle-hide-btn').addEventListener('click', () => { const room = chats[activeChatId]; if (friends[room.name]) { friends[room.name].isHidden = true; saveData(); renderFriends(); showNotification("非表示にしたよ"); } document.getElementById('modal-chat-menu').classList.add('hidden'); document.getElementById('back-btn').click(); });
document.getElementById('delete-friend-btn').addEventListener('click', () => { const room = chats[activeChatId]; delete friends[room.name]; delete chats[activeChatId]; saveData(); renderFriends(); updateChatListUI(); showNotification("削除したよ"); document.getElementById('modal-chat-menu').classList.add('hidden'); document.getElementById('back-btn').click(); });

document.getElementById('stamp-toggle-btn').addEventListener('click', () => {
    document.getElementById('stamp-picker').classList.toggle('hidden');
    document.getElementById('attachment-menu').classList.add('hidden');
    renderStamps();
});
function renderStamps() { document.getElementById('stamp-list').innerHTML = stamps.map(s => `<img src="${s}" class="stamp-item" onclick="sendStamp('${s}')">`).join(''); }
function sendStamp(stampUrl) { sendMessageInternal(`[STAMP]:${stampUrl}`); document.getElementById('stamp-picker').classList.add('hidden'); }

document.getElementById('add-custom-stamp-trigger').addEventListener('click', () => { document.getElementById('modal-custom-stamp').classList.remove('hidden'); });
document.getElementById('save-custom-stamp-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('custom-stamp-file');
    if (fileInput.files.length > 0) {
        const rawBase64 = await readFileAsBase64(fileInput.files[0]);
        const compressedBase64 = await resizeImage(rawBase64, 120, 120);
        stamps.push(compressedBase64);
        saveData();
        renderStamps();
        showNotification("自作スタンプを追加したよ！");
        document.getElementById('modal-custom-stamp').classList.add('hidden');
    }
});

async function sendMessageInternal(msgText) {
    if (!msgText || !activeChatId) return;
    await supabaseClient.from('messages').insert([{ channel: activeChatId, username: myUser.name, avatar: myUser.avatar, message: msgText }]);
}

document.getElementById('send-btn').addEventListener('click', () => { const input = document.getElementById('message-input'); const text = input.value.trim(); if (text) { sendMessageInternal(text); input.value = ''; } });
document.getElementById('message-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') { const text = e.target.value.trim(); if (text) { sendMessageInternal(text); e.target.value = ''; } } });

const ctxMenu = document.getElementById('msg-context-menu');
document.addEventListener('click', () => ctxMenu.classList.add('hidden'));

document.getElementById('ctx-copy-btn').addEventListener('click', () => {
    if (selectedMsgTarget) {
        navigator.clipboard.writeText(selectedMsgTarget.text);
        showNotification("コピーしました！");
    }
});

document.getElementById('ctx-delete-btn').addEventListener('click', async () => {
    if (selectedMsgTarget && selectedMsgTarget.id) {
        await supabaseClient.from('messages').delete().eq('id', selectedMsgTarget.id);
        showNotification("送信を取り消しました");
    }
});

function addMessageToScreen(data) {
    const messagesDiv = document.getElementById('messages'); const isMe = data.username === myUser.name;
    const group = document.createElement('div');
    group.className = `message-group ${isMe ? 'me' : 'other'}`;
    if (data.id) group.setAttribute('data-msg-id', data.id);

    const avatarImg = document.createElement('img'); avatarImg.className = 'msg-avatar'; avatarImg.src = data.avatar || "https://via.placeholder.com/30";
    const content = document.createElement('div'); content.className = 'msg-content';

    if (!isMe) {
        const nameLbl = document.createElement('div'); nameLbl.className = 'msg-username';
        nameLbl.innerText = (friends[data.username] && friends[data.username].nickname) ? friends[data.username].nickname : data.username;
        content.appendChild(nameLbl);
    }

    const wrapper = document.createElement('div'); wrapper.className = 'bubble-wrapper';

    const handleContextMenu = (e) => {
        e.preventDefault();
        selectedMsgTarget = { id: data.id, text: data.message };
        ctxMenu.style.top = `${e.clientY}px`;
        ctxMenu.style.left = `${e.clientX}px`;
        ctxMenu.classList.remove('hidden');
        document.getElementById('ctx-delete-btn').style.display = isMe ? 'block' : 'none';
    };

    if (data.message.startsWith('[STAMP]:')) {
        const stampUrl = data.message.replace('[STAMP]:', '');
        const stampImg = document.createElement('img'); stampImg.className = 'stamp-img'; stampImg.src = stampUrl;
        stampImg.addEventListener('contextmenu', handleContextMenu);
        wrapper.appendChild(stampImg);
    } else if (data.message.startsWith('[FILE]:')) {
        const fileObj = JSON.parse(data.message.replace('[FILE]:', ''));
        const fileBox = document.createElement('div');
        fileBox.className = 'file-bubble';
        fileBox.innerHTML = `📄 <b>${fileObj.name}</b><br><a href="${fileObj.data}" download="${fileObj.name}" class="file-dl-link">💾 ダウンロード</a>`;
        fileBox.addEventListener('contextmenu', handleContextMenu);
        wrapper.appendChild(fileBox);
    } else {
        const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerText = data.message;
        if (isMe) {
            bubble.style.backgroundColor = appSettings.bubbleColor;
            bubble.style.borderRadius = appSettings.bubbleShape;
            bubble.style.borderTopRightRadius = "2px";
        } else {
            bubble.style.borderRadius = appSettings.bubbleShape;
            bubble.style.borderTopLeftRadius = "2px";
        }
        bubble.addEventListener('contextmenu', handleContextMenu);
        wrapper.appendChild(bubble);
    }

    const msgDate = data.created_at ? new Date(data.created_at) : new Date();
    const timeText = document.createElement('span'); timeText.className = 'time';
    timeText.innerHTML = `${isMe ? '<span class="read-mark">既読 </span>' : ''}${msgDate.getHours().toString().padStart(2, '0')}:${msgDate.getMinutes().toString().padStart(2, '0')}`;
    
    wrapper.appendChild(timeText); content.appendChild(wrapper); group.appendChild(avatarImg); group.appendChild(content);
    messagesDiv.appendChild(group); messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// -------------------------------------------------------------
// ★ WebRTC シグナリング・通話コントロール処理ロジック
// -------------------------------------------------------------
document.getElementById('call-audio-btn').addEventListener('click', () => startCall('audio'));
document.getElementById('call-video-btn').addEventListener('click', () => startCall('video'));
document.getElementById('accept-call-btn').addEventListener('click', acceptCall);
document.getElementById('hangup-call-btn').addEventListener('click', hangupCall);

function handleCallSignaling(payload) {
    const { event, from, to, type, sdp, candidate } = payload;
    if (to !== myUser.name) return;

    if (event === 'call-offer') {
        if (callSession.active) {
            sendSignalingMessage({ event: 'call-rejected', from: myUser.name, to: from });
            return;
        }
        callSession = { active: true, roomId: activeChatId, caller: from, callee: myUser.name, type: type };
        showCallModal('incoming');
        // オファーSDPを保持
        callSession.remoteSdp = sdp;
    } 
    else if (event === 'call-answer') {
        if (peerConnection) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            document.getElementById('call-status').innerText = "通話中";
        }
    } 
    else if (event === 'call-candidate') {
        if (peerConnection && candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
        }
    } 
    else if (event === 'call-hangup') {
        endCallState();
        showNotification("通話が終了しました");
    }
    else if (event === 'call-rejected') {
        endCallState();
        showNotification("相手が応答しないか、話し中です");
    }
}

function sendSignalingMessage(data) {
    if (currentSubscription) {
        currentSubscription.send({
            type: 'broadcast',
            event: 'call-signal',
            payload: data
        });
    }
}

async function startCall(type) {
    if (!activeChatId || chats[activeChatId].isGroup) {
        showNotification("グループ通話には対応していません");
        return;
    }
    const targetName = chats[activeChatId].name;
    
    callSession = { active: true, roomId: activeChatId, caller: myUser.name, callee: targetName, type: type };
    showCallModal('outgoing');

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === 'video'
        });
        
        if (type === 'video') {
            document.getElementById('local-video').srcObject = localStream;
        }

        setupPeerConnection(type);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        sendSignalingMessage({
            event: 'call-offer',
            from: myUser.name,
            to: targetName,
            type: type,
            sdp: offer
        });
    } catch (err) {
        console.error("メディアストリーム取得失敗:", err);
        showNotification("カメラまたはマイクへのアクセス許可がありません");
        hangupCall();
    }
}

async function acceptCall() {
    document.getElementById('accept-call-btn').classList.add('hidden');
    document.getElementById('call-status').innerText = "接続中...";

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callSession.type === 'video'
        });

        if (callSession.type === 'video') {
            document.getElementById('local-video').srcObject = localStream;
        }

        setupPeerConnection(callSession.type);

        if (callSession.remoteSdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(callSession.remoteSdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            sendSignalingMessage({
                event: 'call-answer',
                from: myUser.name,
                to: callSession.caller,
                sdp: answer
            });
            document.getElementById('call-status').innerText = "通話中";
        }
    } catch (err) {
        console.error("応答エラー:", err);
        hangupCall();
    }
}

function setupPeerConnection(type) {
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            const target = (callSession.caller === myUser.name) ? callSession.callee : callSession.caller;
            sendSignalingMessage({
                event: 'call-candidate',
                from: myUser.name,
                to: target,
                candidate: event.candidate
            });
        }
    };
}

function hangupCall() {
    const target = (callSession.caller === myUser.name) ? callSession.callee : callSession.caller;
    sendSignalingMessage({ event: 'call-hangup', from: myUser.name, to: target });
    endCallState();
}

function endCallState() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
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

function showCallModal(mode) {
    const modal = document.getElementById('modal-call');
    const status = document.getElementById('call-status');
    const targetDisplay = document.getElementById('call-target-display');
    const acceptBtn = document.getElementById('accept-call-btn');
    const videoContainer = document.getElementById('video-container');

    targetDisplay.innerText = (callSession.caller === myUser.name) ? callSession.callee : callSession.caller;
    
    if (callSession.type === 'video') {
        videoContainer.classList.remove('hidden');
    } else {
        videoContainer.classList.add('hidden');
    }

    if (mode === 'outgoing') {
        status.innerText = "発信中...";
        acceptBtn.classList.add('hidden');
    } else if (mode === 'incoming') {
        status.innerText = `${callSession.type === 'video' ? 'ビデオ通話' : '音声通話'}の着信`;
        acceptBtn.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
}