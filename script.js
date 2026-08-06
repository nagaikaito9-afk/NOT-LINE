// Supabase接続設定
const SUPABASE_URL = "https://nwbxiutmimgqyxmqvbcw.supabase.co";
const SUPABASE_KEY = "sb_publishable_LILo_lXMgV6wc6AZidqyvA_rZDf9Yxi";
const supabase = Supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentGroupId = null;
let selectedFiles = [];
let peerConnection = null;
let localStream = null;

// --- 起動時処理 ---
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-modal').style.display = 'none';
        initApp();
    } else {
        document.getElementById('auth-modal').style.display = 'flex';
    }
});

// --- フォント切替処理 ---
function changeAppFont(fontClass) {
    document.body.className = fontClass;
}

// --- 認証機能 ---
async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const username = document.getElementById('auth-username').value;
    const bio = document.getElementById('auth-bio').value;

    if (!email || !password || !username) {
        alert("メール、パスワード、ユーザーIDは必須です");
        return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
        alert("登録エラー: " + error.message);
        return;
    }

    if (data.user) {
        // profilesテーブルへインサート (idはUUID)
        const { error: pError } = await supabase.from('profiles').insert([{
            id: data.user.id,
            username: username,
            bio: bio
        }]);

        if (pError) alert("プロフィール作成エラー: " + pError.message);
        else {
            alert("登録完了！");
            location.reload();
        }
    }
}

async function handleSignIn() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert("ログインエラー: " + error.message);
    } else {
        location.reload();
    }
}

// --- アプリ初期化 ---
async function initApp() {
    // 自分のプロフィール読み込み
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        document.getElementById('my-name').innerText = profile.username || "名無し";
        document.getElementById('my-bio').innerText = profile.bio || "";
        if (profile.avatar_url) document.getElementById('my-avatar').src = profile.avatar_url;
    }

    loadChatList();
}

// チャットグループ一覧読み込み
async function loadChatList() {
    const { data: groups } = await supabase.from('groups').select('*');
    const listEl = document.getElementById('chat-list');
    listEl.innerHTML = '';

    if (groups) {
        groups.forEach(g => {
            const li = document.createElement('li');
            li.innerText = g.name;
            li.onclick = () => selectGroup(g.id, g.name);
            listEl.appendChild(li);
        });
    }
}

function selectGroup(groupId, groupName) {
    currentGroupId = groupId;
    document.getElementById('current-chat-title').innerText = groupName;
    loadMessages();
    subscribeToMessages();
}

// --- メッセージ＆ファイル（最大10個制限）送信 ---
function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    if (files.length > 10) {
        alert("一度に送信できるファイルは最大10個までです。");
        event.target.value = "";
        selectedFiles = [];
        return;
    }
    selectedFiles = files;
    alert(`${files.length}個のファイルが選択されました`);
}

async function sendMessage() {
    const textInput = document.getElementById('msg-input');
    const text = textInput.value;

    if (!currentGroupId) {
        alert("チャットを選択してください");
        return;
    }
    if (!text && selectedFiles.length === 0) return;

    let fileUrls = [];
    for (let file of selectedFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `attachments/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('chat-attachments')
            .upload(filePath, file);

        if (!uploadError) {
            const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
            fileUrls.push(data.publicUrl);
        }
    }

    await supabase.from('messages').insert([{
        group_id: currentGroupId,
        sender_id: currentUser.id,
        text: text,
        file_urls: fileUrls
    }]);

    textInput.value = '';
    selectedFiles = [];
    document.getElementById('file-input').value = '';
}

// メッセージ表示・リアルタイム同期
async function loadMessages() {
    const { data: msgs } = await supabase
        .from('messages')
        .select('*, stickers(url)')
        .eq('group_id', currentGroupId)
        .order('created_at', { ascending: true });

    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    if (msgs) msgs.forEach(displayMessage);
}

function displayMessage(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    const isMe = msg.sender_id === currentUser.id;
    div.className = `message ${isMe ? 'me' : 'other'}`;

    let content = '';
    if (msg.text) content += `<div>${msg.text}</div>`;
    
    // スタンプ表示
    if (msg.stickers && msg.stickers.url) {
        content += `<img class="sticker" src="${msg.stickers.url}">`;
    }

    // 添付ファイル表示 (最大10個)
    if (msg.file_urls && msg.file_urls.length > 0) {
        msg.file_urls.forEach((url, idx) => {
            content += `<a class="file-attachment" href="${url}" target="_blank">📁 添付ファイル ${idx + 1}</a>`;
        });
    }

    div.innerHTML = content;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function subscribeToMessages() {
    supabase
        .channel(`chat:${currentGroupId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${currentGroupId}` }, payload => {
            loadMessages();
        })
        .subscribe();
}

// --- カスタムスタンプ機能 ---
function toggleStickerPicker() {
    const panel = document.getElementById('sticker-picker-panel');
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) loadStickers();
}

async function uploadCustomSticker(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = `sticker_${Date.now()}.${file.name.split('.').pop()}`;
    const filePath = `user_stickers/${currentUser.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('stickers-bucket').upload(filePath, file);

    if (!uploadError) {
        const { data } = supabase.storage.from('stickers-bucket').getPublicUrl(filePath);
        await supabase.from('stickers').insert([{ user_id: currentUser.id, url: data.publicUrl }]);
        loadStickers();
    }
}

async function loadStickers() {
    const { data: stickers } = await supabase.from('stickers').select('*').eq('user_id', currentUser.id);
    const listEl = document.getElementById('sticker-list-content');
    listEl.innerHTML = '';

    if (stickers) {
        stickers.forEach(s => {
            const img = document.createElement('img');
            img.src = s.url;
            img.onclick = () => sendSticker(s.id);
            listEl.appendChild(img);
        });
    }
}

async function sendSticker(stickerId) {
    if (!currentGroupId) return;
    await supabase.from('messages').insert([{
        group_id: currentGroupId,
        sender_id: currentUser.id,
        sticker_id: stickerId
    }]);
    toggleStickerPicker();
}

// --- 通話機能 (WebRTC Basic) ---
async function startCall(isVideo) {
    document.getElementById('video-call-modal').style.display = 'flex';
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    document.getElementById('local-video').srcObject = localStream;

    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        document.getElementById('remote-video').srcObject = event.streams[0];
    };
}

function endCall() {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    document.getElementById('video-call-modal').style.display = 'none';
}

// --- QR＆グループダイアログ ---
function showQRCode() {
    document.getElementById('qrcode-modal').style.display = 'flex';
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';
    new QRCode(qrDiv, { text: currentUser ? currentUser.id : '', width: 128, height: 128 });
}

async function createGroupPrompt() {
    const name = prompt("グループ名を入力してください:");
    if (name) {
        const { data } = await supabase.from('groups').insert([{ name }]).select().single();
        if (data) loadChatList();
    }
}

function sendFriendRequestPrompt() {
    const friendId = prompt("追加したい相手のユーザーUUIDを入力してください:");
    if (friendId) {
        supabase.from('friends').insert([{ user_id: currentUser.id, friend_id: friendId }]);
        alert("フレンド申請を送信しました");
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}