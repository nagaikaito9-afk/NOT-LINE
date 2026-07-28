// ★SupabaseのURLとPublishable Keyを設定済み！
const SUPABASE_URL = "https://snxfgzqvnafsnrqrhgbh.supabase.co";
const SUPABASE_KEY = "sb_publishable_aTck43w4EIMBhdUiz_sqJg_Mohv4YHc";
const GOOGLE_CLIENT_ID = "56462276148-q2n8gpnaphi48gjq7is0i07dtr4ger0v.apps.googleusercontent.com";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let myUser = JSON.parse(localStorage.getItem('notline_myUser')) || null;
let friends = JSON.parse(localStorage.getItem('notline_friends')) || {};
let chatsData = JSON.parse(localStorage.getItem('notline_chats')) || {};
let chats = {};
let stamps = JSON.parse(localStorage.getItem('notline_stamps')) || [
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=happy",
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=sad",
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=love",
    "https://api.dicebear.com/7.x/fun-emoji/svg?seed=cool"
];
let activeChatId = null;
let currentSubscription = null;

function saveData() {
    if (myUser) localStorage.setItem('notline_myUser', JSON.stringify(myUser));
    localStorage.setItem('notline_friends', JSON.stringify(friends));
    localStorage.setItem('notline_stamps', JSON.stringify(stamps));
    
    const chatsToSave = {};
    Object.keys(chats).forEach(id => {
        chatsToSave[id] = {
            name: chats[id].name,
            isGroup: chats[id].isGroup,
            unread: chats[id].unread,
            avatar: chats[id].avatar,
            bgImage: chats[id].bgImage
        };
    });
    localStorage.setItem('notline_chats', JSON.stringify(chatsToSave));
}

function showNotification(msg) {
    let toast = document.getElementById('toast-notification') || document.createElement('div');
    toast.id = 'toast-notification';
    document.getElementById('app-container').appendChild(toast);
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
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
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
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
    completeLogin(userData.name, userData.picture);
    showNotification(`${userData.name} としてログインしたよ！`);
}

window.onload = function () {
    if (typeof google !== 'undefined') {
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse });
        google.accounts.id.renderButton(document.getElementById("google-btn-container"), { theme: "outline", size: "large", width: "250" });
    }

    if (myUser) {
        completeLogin(myUser.name, myUser.avatar);
    }
};

function completeLogin(username, avatarUrl) {
    myUser = {
        name: username,
        avatar: avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=" + username
    };
    saveData();

    document.getElementById('my-name-display').innerText = myUser.name;
    document.getElementById('my-avatar').src = myUser.avatar;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');

    Object.keys(chatsData).forEach(roomId => {
        const room = chatsData[roomId];
        registerChatRoom(roomId, room.name, room.isGroup, room.avatar, room.bgImage);
    });

    renderFriends();
    updateChatListUI();
}

document.getElementById('logout-btn').addEventListener('click', () => {
    myUser = null;
    localStorage.removeItem('notline_myUser');
    document.getElementById('main-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
});

document.getElementById('edit-profile-trigger').addEventListener('click', () => {
    document.getElementById('edit-name-input').value = myUser.name;
    document.getElementById('modal-profile').classList.remove('hidden');
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const newName = document.getElementById('edit-name-input').value.trim();
    const fileInput = document.getElementById('edit-avatar-file');
    if (newName) myUser.name = newName;
    if (fileInput.files.length > 0) {
        const rawBase64 = await readFileAsBase64(fileInput.files[0]);
        myUser.avatar = await resizeImage(rawBase64, 150, 150);
    }
    saveData();
    document.getElementById('my-name-display').innerText = myUser.name;
    document.getElementById('my-avatar').src = myUser.avatar;
    document.getElementById('modal-profile').classList.add('hidden');
});

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
    document.getElementById('form-add-friend').classList.add('hidden'); document.getElementById('form-add-group').classList.remove('hidden');
    const container = document.getElementById('group-member-select');
    container.innerHTML = Object.keys(friends).map(id => `<label style="display:block;"><input type="checkbox" value="${id}"> ${friends[id].nickname || friends[id].name}</label>`).join('');
});

document.getElementById('add-friend-submit').addEventListener('click', () => {
    const friendName = document.getElementById('friend-id-input').value.trim();
    if (!friendName) { showNotification("相手の名前を入力してね！"); return; }
    if (friendName === myUser.name) { showNotification("自分自身は追加できないよ！"); return; }

    if (!friends[friendName]) {
        friends[friendName] = { name: friendName, nickname: "", avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${friendName}`, isMuted: false, isBlocked: false, isHidden: false };
        saveData();
        renderFriends();
        
        const pair = [myUser.name, friendName].sort();
        registerChatRoom(`chat_${pair[0]}_${pair[1]}`, friendName, false, friends[friendName].avatar);
        showNotification(`${friendName} を追加したよ！`);
    } else {
        showNotification("すでに追加されているよ！");
    }
    document.getElementById('modal-add').classList.add('hidden');
    document.getElementById('friend-id-input').value = '';
});

document.getElementById('create-group-submit').addEventListener('click', () => {
    const groupName = document.getElementById('group-name-input').value.trim();
    if (!groupName) { showNotification("グループ名を入力してね"); return; }
    const roomId = `group_${Date.now()}`;
    registerChatRoom(roomId, groupName, true, `https://api.dicebear.com/7.x/identicon/svg?seed=${groupName}`);
    showNotification(`グループ「${groupName}」を作成したよ！`);
    document.getElementById('modal-add').classList.add('hidden');
    document.getElementById('group-name-input').value = '';
});

function registerChatRoom(roomId, name, isGroup, avatar, bgImage = "") {
    if (chats[roomId]) return;
    chats[roomId] = { name, isGroup, unread: 0, avatar, bgImage };
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

    // Supabaseから過去メッセージを取得して表示
    const { data: pastMessages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel', roomId)
        .order('created_at', { ascending: true });

    if (!error && pastMessages) {
        pastMessages.forEach(msg => addMessageToScreen(msg));
    }

    if (currentSubscription) {
        supabase.removeChannel(currentSubscription);
    }

    // リアルタイム通信の監視スタート
    currentSubscription = supabase
        .channel(`room:${roomId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `channel=eq.${roomId}`
        }, payload => {
            const newMsg = payload.new;
            if (friends[newMsg.username] && friends[newMsg.username].isBlocked) return;

            if (newMsg.message.startsWith('[SYSTEM_BG]:')) {
                const bgData = newMsg.message.replace('[SYSTEM_BG]:', '');
                chats[roomId].bgImage = bgData;
                saveData();
                document.getElementById('chat-screen').style.backgroundImage = `url(${bgData})`;
                return;
            }

            addMessageToScreen(newMsg);
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
        li.innerHTML = `<img src="${room.avatar}" class="avatar"><div class="item-info"><div class="item-title">${room.name}</div><div class="item-sub">${room.isGroup ? 'グループ' : '1対1トーク'}</div></div><span class="badge ${room.unread === 0 ? 'hidden' : ''}">${room.unread}</span>`;
        list.appendChild(li);
    });
    const totalBadge = document.getElementById('total-unread'); totalBadge.innerText = totalUnread;
    totalBadge.classList.toggle('hidden', totalUnread === 0);
}

document.getElementById('back-btn').addEventListener('click', () => {
    if (currentSubscription) supabase.removeChannel(currentSubscription);
    activeChatId = null;
    document.getElementById('chat-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
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

document.getElementById('stamp-toggle-btn').addEventListener('click', () => { document.getElementById('stamp-picker').classList.toggle('hidden'); renderStamps(); });
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
    
    await supabase.from('messages').insert([
        {
            channel: activeChatId,
            username: myUser.name,
            avatar: myUser.avatar,
            message: msgText
        }
    ]);
}

document.getElementById('send-btn').addEventListener('click', () => { const input = document.getElementById('message-input'); const text = input.value.trim(); if (text) { sendMessageInternal(text); input.value = ''; } });
document.getElementById('message-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') { const text = e.target.value.trim(); if (text) { sendMessageInternal(text); e.target.value = ''; } } });

function addMessageToScreen(data) {
    const messagesDiv = document.getElementById('messages'); const isMe = data.username === myUser.name;
    const group = document.createElement('div'); group.className = `message-group ${isMe ? 'me' : 'other'}`;
    const avatarImg = document.createElement('img'); avatarImg.className = 'msg-avatar'; avatarImg.src = data.avatar || "https://via.placeholder.com/30";
    const content = document.createElement('div'); content.className = 'msg-content';

    if (!isMe) {
        const nameLbl = document.createElement('div'); nameLbl.className = 'msg-username';
        nameLbl.innerText = (friends[data.username] && friends[data.username].nickname) ? friends[data.username].nickname : data.username;
        content.appendChild(nameLbl);
    }

    const wrapper = document.createElement('div'); wrapper.className = 'bubble-wrapper';

    if (data.message.startsWith('[STAMP]:')) {
        const stampUrl = data.message.replace('[STAMP]:', '');
        const stampImg = document.createElement('img'); stampImg.className = 'stamp-img'; stampImg.src = stampUrl;
        wrapper.appendChild(stampImg);
    } else {
        const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerText = data.message;
        wrapper.appendChild(bubble);
    }

    const timeSpan = document.createElement('span'); timeSpan.className = 'time';
    const msgDate = data.created_at ? new Date(data.created_at) : new Date();
    timeSpan.innerText = `${msgDate.getHours().toString().padStart(2, '0')}:${msgDate.getMinutes().toString().padStart(2, '0')}`;
    
    wrapper.appendChild(timeSpan); content.appendChild(wrapper); group.appendChild(avatarImg); group.appendChild(content);
    messagesDiv.appendChild(group); messagesDiv.scrollTop = messagesDiv.scrollHeight;
}