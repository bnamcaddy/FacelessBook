const API_URL = 'http://localhost:5000/api';
let currentUser = JSON.parse(localStorage.getItem('user')) || null;
const toastContainer = document.getElementById('toast-container');
const page = document.location.pathname.split('/').pop() || 'index.html';
let socket = null;

function getCookie(n){const c=n+"=";const d=decodeURIComponent(document.cookie).split(';');for(let i=0;i<d.length;i++){let s=d[i].trim();if(s.indexOf(c)===0)return s.substring(c.length);}return "";}

function init(){
    if(!currentUser||!getCookie('token')){localStorage.removeItem('user');window.location.href='login.html';return;}
    
    // Initialize Socket connection
    if (typeof io !== 'undefined') {
        socket = io('http://localhost:5000');
        socket.emit('register', currentUser.id);

        // Listen for direct messages globally
        socket.on('message', (msg) => {
            if (page === 'messages.html' && activeChatUser === msg.sender_id) {
                // Append message instantly if in chat with this user
                appendRealtimeMessage(msg);
            } else {
                showNotification(`New message from user ID ${msg.sender_id}!`);
                loadNotifBadge();
                if (page === 'messages.html') {
                    loadConversations();
                }
            }
        });

        // Listen for live notifications globally
        socket.on('notification', (notif) => {
            showNotification(`${notif.message}`);
            loadNotifBadge();
            if (page === 'notifications.html') {
                initNotifications();
            }
        });

        // Listen for peer typing globally
        socket.on('typing', ({ senderId, isTyping }) => {
            if (page === 'messages.html' && activeChatUser === senderId) {
                const header = document.querySelector('.chat-header');
                if (header) {
                    let typingEl = document.getElementById('chat-typing-indicator');
                    if (isTyping) {
                        if (!typingEl) {
                            typingEl = document.createElement('span');
                            typingEl.id = 'chat-typing-indicator';
                            typingEl.style.fontSize = '0.8rem';
                            typingEl.style.color = 'var(--text-muted)';
                            typingEl.style.marginLeft = '8px';
                            typingEl.innerText = 'is typing...';
                            header.appendChild(typingEl);
                        }
                    } else {
                        if (typingEl) typingEl.remove();
                    }
                }
            }
        });

        // Rich Chat - Read Receipt
        socket.on('read-receipt', ({ messageId, time, readerId }) => {
            if (page === 'messages.html' && activeChatUser === readerId) {
                const msgEl = document.querySelector(`.chat-msg[data-id="${messageId}"]`);
                if (msgEl) {
                    let statusEl = msgEl.querySelector('.msg-read-status');
                    if (!statusEl) {
                        statusEl = document.createElement('div');
                        statusEl.className = 'msg-read-status';
                        statusEl.style = 'font-size: 0.7rem; color: var(--primary); text-align: right; margin-top: 4px;';
                        msgEl.appendChild(statusEl);
                    }
                    const readTime = new Date(time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    statusEl.innerText = `Seen ${readTime}`;
                }
            }
        });

        // WebRTC Signaling
        socket.on('call-made', async (data) => {
            document.getElementById('incoming-call-overlay').style.display = 'flex';
            document.getElementById('incoming-caller-name').innerText = `Incoming ${data.isVideo ? 'Video' : 'Audio'} Call`;
            
            document.getElementById('accept-call-btn').onclick = () => acceptCall(data.offer, data.callerId, data.isVideo);
            document.getElementById('reject-call-btn').onclick = () => {
                document.getElementById('incoming-call-overlay').style.display = 'none';
                socket.emit('call-rejected', { to: data.socket });
            };
        });

        socket.on('answer-made', async (data) => {
            document.getElementById('call-status').innerText = 'Connected';
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        });

        socket.on('ice-candidate-received', async (candidate) => {
            try { await peerConnection.addIceCandidate(candidate); } catch(e) {}
        });

        socket.on('call-ended', () => {
            closeCallUI();
            showNotification('Call ended');
        });

        socket.on('call-rejected', () => {
            closeCallUI();
            showNotification('Call declined');
        });
    }
    
    const navName = document.getElementById('nav-username');
    if(navName) navName.innerText = currentUser.username;
    const navPic = document.getElementById('nav-profile-pic');
    if(navPic) navPic.src = currentUser.profile_pic || 'https://via.placeholder.com/40';
    
    const lo = document.getElementById('logout-btn-new') || document.getElementById('logout-btn');
    if(lo) lo.onclick = () => {
        localStorage.removeItem('user');
        document.cookie = 'token=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
        window.location.href = 'login.html';
    };

    setupHeaderActions();
    setupCreateFab();
    loadNotifBadge();
    
    if(page==='index.html'||page==='') initHome();
    else if(page==='friends.html') initFriends();
    else if(page==='messages.html') initMessages();
    else if(page==='reels.html') initReels();
    else if(page==='notifications.html') initNotifications();
    else if(page==='marketplace.html') initMarketplace();
    else if(page==='profile.html') initProfile();
    else if(page==='settings.html') initSettings();
    else if(page==='events.html') initHome();
}

function setupHeaderActions() {
    const plusBtn = document.getElementById('nav-plus-btn');
    const plusDropdown = document.getElementById('plus-dropdown');
    const menuBtn = document.getElementById('nav-menu-btn');
    const menuDropdown = document.getElementById('menu-dropdown');
    const searchInput = document.getElementById('header-search-input');
    const searchResults = document.getElementById('search-results');
    const profileBtn = document.getElementById('menu-profile-btn');
    const navProfileLink = document.getElementById('nav-profile-link');
    const searchBtnMobile = document.getElementById('nav-search-btn-mobile');
    const searchBar = document.getElementById('search-bar');

    if (searchBtnMobile && searchBar) {
        searchBtnMobile.onclick = (e) => {
            e.stopPropagation();
            searchBar.parentElement.classList.toggle('show-mobile');
            if(searchBar.parentElement.classList.contains('show-mobile')) {
                searchInput.focus();
            }
        };
    }

    if (plusBtn && plusDropdown) {
        plusBtn.onclick = (e) => {
            e.stopPropagation();
            plusDropdown.classList.toggle('show');
            if(menuDropdown) menuDropdown.classList.remove('show');
        };
    }

    if (menuBtn && menuDropdown) {
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            menuDropdown.classList.toggle('show');
            if(plusDropdown) plusDropdown.classList.remove('show');
        };
    }

    if (profileBtn) profileBtn.onclick = () => window.location.href = `profile.html?id=${currentUser.id}`;
    if (navProfileLink) navProfileLink.onclick = () => window.location.href = `profile.html?id=${currentUser.id}`;

    document.addEventListener('click', () => {
        if (plusDropdown) plusDropdown.classList.remove('show');
        if (menuDropdown) menuDropdown.classList.remove('show');
        if (searchResults) searchResults.classList.remove('show');
    });

    if (searchInput) {
        searchInput.addEventListener('input', debounce(async (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                searchResults.classList.remove('show');
                return;
            }
            try {
                const r = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
                const data = await r.json();
                if (data.users.length || data.posts.length) {
                    let html = '';
                    if (data.users.length) {
                        html += '<div style="padding:8px 16px; font-size:0.8rem; color:var(--text-muted); font-weight:600;">USERS</div>';
                        html += data.users.map(u => `
                            <div class="search-result-item" onclick="window.location.href='profile.html?id=${u.id}'">
                                <img src="${u.profile_pic || 'https://via.placeholder.com/40'}" alt="">
                                <span>${u.username}</span>
                            </div>
                        `).join('');
                    }
                    searchResults.innerHTML = html;
                    searchResults.classList.add('show');
                } else {
                    searchResults.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);">No results found</div>';
                    searchResults.classList.add('show');
                }
            } catch (e) {}
        }, 300));
    }
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function showNotification(msg,type='success'){
    if(!toastContainer)return;
    const t=document.createElement('div');t.className='toast '+type;
    const icon=type==='success'?'fa-check-circle':'fa-exclamation-circle';
    t.innerHTML=`<i class="fas ${icon}"></i><span>${msg}</span>`;
    toastContainer.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},4000);
}

function timeAgo(d){const s=Math.floor((Date.now()-new Date(d))/1000);if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}

function getPrivacyIcon(privacy) {
    if (privacy === 'friends') return '<i class="fas fa-users" title="Friends Only"></i>';
    if (privacy === 'close_friends') return '<i class="fas fa-star" style="color:#f1c40f;" title="Close Friends"></i>';
    if (privacy === 'only_me') return '<i class="fas fa-lock" title="Only Me"></i>';
    return '<i class="fas fa-globe" title="Public"></i>';
}

// ===== CREATE FAB =====
function setupCreateFab(){
    const fab=document.getElementById('create-fab');
    const menu=document.getElementById('create-menu');
    if(!fab||!menu)return;
    fab.onclick=()=>{fab.classList.toggle('open');menu.classList.toggle('show');};
    document.addEventListener('click',e=>{if(!fab.contains(e.target)&&!menu.contains(e.target)){fab.classList.remove('open');menu.classList.remove('show');}});
}

// ===== MODAL =====
function openModal(type){
    const overlay=document.getElementById('modal-overlay');
    const title=document.getElementById('modal-title');
    const body=document.getElementById('modal-body');
    if(!overlay||!body)return;
    const menu=document.getElementById('create-menu');if(menu)menu.classList.remove('show');
    const fab=document.getElementById('create-fab');if(fab)fab.classList.remove('open');
    const titles={post:'Create Post',story:'Create Story',reel:'Create Reel',note:'Create Note',marketplace:'List Item'};
    title.textContent=titles[type]||'Create';
    if(type==='post')body.innerHTML=`
        <textarea id="m-content" placeholder="What's on your mind?"></textarea>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <select id="m-privacy-select" class="post-privacy-select">
                <option value="public">🌎 Public</option>
                <option value="friends">👥 Friends</option>
                <option value="close_friends">⭐ Close Friends</option>
                <option value="only_me">🔒 Only Me</option>
            </select>
            <button class="primary-btn" onclick="submitPost()" style="width:auto; padding:8px 24px;">Post</button>
        </div>
    `;
    else if(type==='story') body.innerHTML=`
        <textarea id="m-content" placeholder="Share your story..." style="height:80px;"></textarea>
        <input type="file" id="m-story-media" accept="image/*,video/*" style="margin-top:8px;">
        <button class="primary-btn" onclick="submitStory()">Share Story</button>
    `;
    else if(type==='reel')body.innerHTML=`<input id="m-video" placeholder="Video URL"><textarea id="m-caption" placeholder="Caption..." style="height:80px;"></textarea><button class="primary-btn" onclick="submitReel()">Post Reel</button>`;
    else if(type==='note')body.innerHTML=`<textarea id="m-content" placeholder="Write a note..." style="height:100px;"></textarea><button class="primary-btn" onclick="submitNote()">Save Note</button>`;
    else if(type==='marketplace')body.innerHTML=`<input id="m-name" placeholder="Item Name"><textarea id="m-desc" placeholder="Description..." style="height:80px;"></textarea><input id="m-price" type="number" step="0.01" placeholder="Price"><input id="m-image" placeholder="Image URL (optional)"><select id="m-cat"><option>General</option><option>Electronics</option><option>Clothing</option><option>Furniture</option><option>Vehicles</option><option>Other</option></select><button class="primary-btn" onclick="submitMarketItem()">List Item</button>`;
    overlay.classList.add('show');
}
function closeModal(){const o=document.getElementById('modal-overlay');if(o)o.classList.remove('show');}

// ===== SUBMIT HANDLERS =====
async function submitPost(){
    const c=document.getElementById('m-content');if(!c||!c.value.trim()){showNotification('Write something!','error');return;}
    const privacySelect=document.getElementById('m-privacy-select');
    const privacy=privacySelect?privacySelect.value:'public';
    try{const r=await fetch(`${API_URL}/posts`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,content:c.value,privacy:privacy})});
    if(r.ok){showNotification('Post created!');closeModal();if(page==='index.html'||page==='')fetchPosts();}else throw new Error();}catch(e){showNotification('Failed to create post','error');}
}

// Updated fetchStories to render circular story thumbnails with click handler
async function fetchStories(){
    const bar=document.getElementById('stories-bar');if(!bar)return;
    try{
        const r=await fetch(`${API_URL}/stories`);
        const stories=await r.json();
        if(!stories.length){
            bar.innerHTML='<div class="empty-state" style="padding:20px;">No stories yet</div>';
            return;
        }
        // Render each story card
        bar.innerHTML=stories.map(s=>`\
            <div class=\"story-card\" onclick=\"openStory(${s.id})\">\
                <div class=\"story-avatar\" style=\"background-image:url(${s.profile_pic||'https://via.placeholder.com/40'});\"></div>\
                <div class=\"story-user\">${s.username}</div>\
            </div>`).join('');
    }catch(e){
        console.error(e);
        bar.innerHTML='';
    }
}

// Updated submitStory to handle file upload before posting story
async function submitStory(){
    const c=document.getElementById('m-content');
    const fileInput=document.getElementById('m-story-media');
    if(!c||!c.value.trim()){
        showNotification('Write something!','error');
        return;
    }
    try{
        let imageUrl=null;
        if(fileInput && fileInput.files.length>0){
            const formData=new FormData();
            formData.append('file', fileInput.files[0]);
            const uploadRes=await fetch(`${API_URL}/upload`,{method:'POST',body:formData});
            const uploadData=await uploadRes.json();
            if(uploadRes.ok){
                imageUrl=uploadData.url;
            }else{
                throw new Error(uploadData.error||'Upload failed');
            }
        }
        const r=await fetch(`${API_URL}/stories`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,content:c.value,imageUrl})});
        if(r.ok){
            showNotification('Story shared!');
            closeModal();
            fetchStories();
        }else throw new Error();
    }catch(e){
        showNotification('Failed to share story','error');
    }
}

// Story viewer logic
let storyTimer=null;
function openStory(storyId){
    // Fetch story details
    fetch(`${API_URL}/stories/${storyId}`)
    .then(res=>res.json())
    .then(story=>{
        const title=document.getElementById('story-viewer-title');
        const mediaContainer=document.getElementById('story-media');
        const progress=document.getElementById('story-progress');
        if(title) title.textContent=story.username||'Story';
        // Determine media type
        if(story.image_url){
            if(story.image_url.match(/\.(mp4|webm|ogg)$/i)){
                mediaContainer.innerHTML=`<video src="${story.image_url}" autoplay muted style="max-width:100%; max-height:100%;"></video>`;
            }else{
                mediaContainer.innerHTML=`<img src="${story.image_url}" style="max-width:100%; max-height:100%; object-fit:contain;"/>`;
            }
        }else{
            mediaContainer.innerHTML='';
        }
        // Show viewer
        const viewer=document.getElementById('story-viewer');
        if(viewer) viewer.style.display='flex';
        // Start progress bar animation (5 seconds)
        if(progress){
            progress.style.transition='none';
            progress.style.width='0%';
            // Force reflow
            void progress.offsetWidth;
            progress.style.transition='width 5s linear';
            progress.style.width='100%';
        }
        // Auto close after duration
        clearTimeout(storyTimer);
        storyTimer=setTimeout(()=>{closeStoryViewer();},5000);
    })
    .catch(err=>{console.error(err);});
}
function closeStoryViewer(){
    const viewer=document.getElementById('story-viewer');
    if(viewer) viewer.style.display='none';
    const media=document.getElementById('story-media');
    if(media) media.innerHTML='';
    const progress=document.getElementById('story-progress');
    if(progress){
        progress.style.transition='none';
        progress.style.width='0%';
    }
    clearTimeout(storyTimer);
}

async function submitReel(){
    const v=document.getElementById('m-video');const c=document.getElementById('m-caption');
    try{const r=await fetch(`${API_URL}/reels`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,videoUrl:v?v.value:null,caption:c?c.value:''})});
    if(r.ok){showNotification('Reel posted!');closeModal();if(page==='reels.html')initReels();}else throw new Error();}catch(e){showNotification('Failed','error');}
}
async function submitNote(){
    const c=document.getElementById('m-content');if(!c||!c.value.trim()){showNotification('Write something!','error');return;}
    try{const r=await fetch(`${API_URL}/notes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,content:c.value})});
    if(r.ok){showNotification('Note saved!');closeModal();}else throw new Error();}catch(e){showNotification('Failed','error');}
}
async function submitMarketItem(){
    const name=document.getElementById('m-name');const desc=document.getElementById('m-desc');const price=document.getElementById('m-price');const img=document.getElementById('m-image');const cat=document.getElementById('m-cat');
    if(!name||!name.value||!price||!price.value){showNotification('Name and price required!','error');return;}
    try{const r=await fetch(`${API_URL}/marketplace`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,itemName:name.value,description:desc?desc.value:'',price:parseFloat(price.value),imageUrl:img?img.value:null,category:cat?cat.value:'General'})});
    if(r.ok){showNotification('Item listed!');closeModal();if(page==='marketplace.html')initMarketplace();}else throw new Error();}catch(e){showNotification('Failed','error');}
}

// ===== NOTIF BADGE =====
async function loadNotifBadge(){
    try{const r=await fetch(`${API_URL}/notifications/${currentUser.id}/unread-count`);const d=await r.json();
    const b=document.getElementById('notif-badge');if(b&&d.count>0){b.textContent=d.count;b.style.display='flex';}
    }catch(e){}
}

// ===== HOME PAGE =====
async function initHome(){
    fetchStories();
    fetchPosts();
    fetchFriendsSidebar();

    // Setup Post Avatar
    const postAvatar = document.getElementById('create-post-avatar');
    if(postAvatar) postAvatar.src = currentUser.profile_pic || 'https://via.placeholder.com/40';

    // Setup Media Upload
    const mediaInput = document.getElementById('post-media-input');
    const mediaBtn = document.getElementById('media-upload-btn');
    const previewContainer = document.getElementById('media-preview-container');
    
    let selectedMedia = null;

    if (mediaBtn && mediaInput) {
        mediaBtn.onclick = () => mediaInput.click();
        mediaInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                selectedMedia = file;
                const reader = new FileReader();
                reader.onload = (re) => {
                    previewContainer.innerHTML = `
                        <button class="remove-media" id="remove-media-btn">&times;</button>
                        ${file.type.startsWith('image/') ? `<img src="${re.target.result}">` : `<video src="${re.target.result}" controls></video>`}
                    `;
                    previewContainer.classList.remove('hidden');
                    document.getElementById('remove-media-btn').onclick = () => {
                        selectedMedia = null;
                        mediaInput.value = '';
                        previewContainer.innerHTML = '';
                        previewContainer.classList.add('hidden');
                    };
                };
                reader.readAsDataURL(file);
            }
        };
    }

    const btn=document.getElementById('create-post-btn');
    if(btn) btn.onclick=async()=>{
        const c=document.getElementById('post-content');
        if(!c || (!c.value.trim() && !selectedMedia)){
            showNotification('Write something or add media!','error');
            return;
        }
        
        btn.disabled = true;
        btn.innerText = 'Posting...';

        try {
            let imageUrl = null;
            if (selectedMedia) {
                const formData = new FormData();
                formData.append('file', selectedMedia);
                const uploadRes = await fetch(`${API_URL}/upload`, {
                    method: 'POST',
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadRes.ok) {
                    imageUrl = uploadData.url;
                } else {
                    throw new Error(uploadData.error || 'Upload failed');
                }
            }

            const privacySelect = document.getElementById('post-privacy-select');
            const privacy = privacySelect ? privacySelect.value : 'public';

            const r=await fetch(`${API_URL}/posts`,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    userId:currentUser.id,
                    content:c.value,
                    imageUrl: imageUrl,
                    privacy: privacy
                })
            });
            
            if(r.ok){
                c.value='';
                selectedMedia = null;
                if(previewContainer) {
                    previewContainer.innerHTML = '';
                    previewContainer.classList.add('hidden');
                }
                showNotification('Post created!');
                fetchPosts();
            } else {
                const errData = await r.json();
                throw new Error(errData.error || 'Failed to create post');
            }
        } catch(e) {
            showNotification(e.message || 'Failed','error');
        } finally {
            btn.disabled = false;
            btn.innerText = 'Post';
        }
    };
}

// ===== PROFILE PAGE =====
async function initProfile(){
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id') || currentUser.id;
    
    try {
        const r = await fetch(`${API_URL}/users/${userId}`);
        const user = await r.json();
        
        if (r.status === 404) {
            showNotification('User not found', 'error');
            return;
        }

        const nameEl = document.getElementById('profile-name');
        const picEl = document.getElementById('profile-pic');
        const bioEl = document.getElementById('profile-bio');
        const editBtn = document.getElementById('edit-profile-btn');
        
        if(nameEl) nameEl.innerText = user.username;
        if(picEl) picEl.src = user.profile_pic || 'https://via.placeholder.com/150';
        if(bioEl) bioEl.innerText = user.bio || 'No bio yet.';
        
        if (editBtn && userId == currentUser.id) {
            editBtn.classList.remove('hidden');
            editBtn.onclick = () => openEditProfileModal(user);
        }

        fetchUserPosts(userId);
    } catch(e) {
        showNotification('Failed to load profile','error');
    }
}

function openEditProfileModal(user) {
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    title.innerText = 'Edit Profile';
    body.innerHTML = `
        <div class="edit-profile-form">
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="edit-username" value="${user.username}">
            </div>
            <div class="form-group">
                <label>Bio</label>
                <textarea id="edit-bio">${user.bio || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Profile Picture</label>
                <input type="file" id="edit-pic-input" accept="image/*">
                <div id="edit-pic-preview" style="margin-top:10px;">
                    <img src="${user.profile_pic}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;">
                </div>
            </div>
            <button class="primary-btn" id="save-profile-btn">Save Changes</button>
        </div>
    `;

    const picInput = document.getElementById('edit-pic-input');
    const picPreview = document.getElementById('edit-pic-preview');
    let selectedPic = null;

    picInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedPic = file;
            const reader = new FileReader();
            reader.onload = (re) => {
                picPreview.innerHTML = `<img src="${re.target.result}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;">`;
            };
            reader.readAsDataURL(file);
        }
    };

    document.getElementById('save-profile-btn').onclick = async () => {
        const username = document.getElementById('edit-username').value;
        const bio = document.getElementById('edit-bio').value;
        const btn = document.getElementById('save-profile-btn');
        
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            let profilePic = user.profile_pic;
            if (selectedPic) {
                const formData = new FormData();
                formData.append('file', selectedPic);
                const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
                const uploadData = await uploadRes.json();
                profilePic = uploadData.url;
            }

            const r = await fetch(`${API_URL}/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, bio, profilePic })
            });

            if (r.ok) {
                const resData = await r.json();
                localStorage.setItem('user', JSON.stringify({ ...currentUser, username: resData.user.username, profile_pic: resData.user.profile_pic }));
                showNotification('Profile updated!');
                closeModal();
                location.reload();
            } else throw new Error();
        } catch(e) {
            showNotification('Failed to update profile', 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save Changes';
        }
    };

    modal.style.display = 'flex';
}

async function fetchUserPosts(userId) {
    const c = document.getElementById('user-posts-container');
    if(!c) return;
    
    try {
        const r = await fetch(`${API_URL}/users/${userId}/posts?viewerId=${currentUser.id}`);
        const posts = await r.json();
        
        if(!posts.length) {
            c.innerHTML = '<div class="empty-state"><p>No posts yet.</p></div>';
            return;
        }
        
        c.innerHTML = posts.map(p => {
            const isVideo = p.image_url && (p.image_url.includes('video') || p.image_url.endsWith('.mp4') || p.image_url.endsWith('.mov') || p.image_url.endsWith('.avi'));
            return `
            <div class="post glass-card">
                <div class="post-header">
                    <img class="post-avatar" src="${p.profile_pic || 'https://via.placeholder.com/40'}" alt="">
                    <div class="post-meta">
                        <div class="post-user">${p.username}</div>
                        <div class="post-date">${timeAgo(p.created_at)} <span class="privacy-icon">${getPrivacyIcon(p.privacy)}</span></div>
                    </div>
                </div>
                <div class="post-content">${p.content}</div>
                ${p.image_url ? `<div class="post-media">${isVideo ? `<video src="${p.image_url}" controls></video>` : `<img src="${p.image_url}">`}</div>` : ''}
                <div class="post-stats">
                    <span><i class="fas fa-thumbs-up"></i> ${p.likes_count || 0}</span>
                    <span><i class="fas fa-comment"></i> ${p.comments_count || 0}</span>
                </div>
            </div>
        `}).join('');
    } catch(e) {
        console.error(e);
        c.innerHTML = '<div class="empty-state"><p>Error loading posts.</p></div>';
    }
}

async function fetchStories(){
    const bar=document.getElementById('stories-bar');if(!bar)return;
    try{const r=await fetch(`${API_URL}/stories`);const stories=await r.json();
    if(!stories.length){bar.innerHTML='<div class="empty-state" style="padding:20px;"><p>No stories yet</p></div>';return;}
    bar.innerHTML=stories.map(s=>`<div class="story-card"><div class="story-avatar" style="background:var(--border);"></div><div class="story-user">${s.username}</div></div>`).join('');
    }catch(e){bar.innerHTML='';}
}

async function fetchPosts(){
    const c=document.getElementById('posts-container');if(!c)return;
    try{
        const r=await fetch(`${API_URL}/posts?viewerId=${currentUser.id}`);
        if(!r.ok) {
            const err = await r.json();
            throw new Error(err.error || 'Failed to fetch posts');
        }
        const posts=await r.json();
        if(!posts.length){c.innerHTML='<div class="empty-state"><i class="fas fa-newspaper"></i><p>No posts yet. Be the first to share!</p></div>';return;}
        c.innerHTML='';
        for(const p of posts){
            let comments=[];try{const cr=await fetch(`${API_URL}/posts/${p.id}/comments?viewerId=${currentUser.id}`);comments=await cr.json();}catch(e){}
            const el=document.createElement('div');el.className='post glass-card';
            const isVideo = p.image_url && (p.image_url.includes('video') || p.image_url.endsWith('.mp4') || p.image_url.endsWith('.mov') || p.image_url.endsWith('.avi'));
            
            const hasViewerReaction = p.viewer_reaction;
            const viewerReactionItem = REACTION_MAP[hasViewerReaction];

            el.innerHTML=`<div class="post-header"><img class="post-avatar" src="${p.profile_pic||'https://via.placeholder.com/40'}" alt="" onclick="window.location.href='profile.html?id=${p.user_id}'" style="cursor:pointer;"><div class="post-meta"><div class="post-user" onclick="window.location.href='profile.html?id=${p.user_id}'" style="cursor:pointer;">${p.username}</div><div class="post-date">${timeAgo(p.created_at)} <span class="privacy-icon">${getPrivacyIcon(p.privacy)}</span></div></div></div>
            <div class="post-content">${p.content}</div>
            ${p.image_url ? `<div class="post-media">${isVideo ? `<video src="${p.image_url}" controls></video>` : `<img src="${p.image_url}">`}</div>` : ''}
            <div class="post-stats">
                ${renderReactionsSummary(p.reactions_summary, p.likes_count)}
                <span style="margin-left: auto; display: flex; gap: 12px;">
                    <span><i class="fas fa-comment"></i> ${p.comments_count||0}</span>
                    <span><i class="fas fa-share"></i> ${p.shares_count||0}</span>
                </span>
            </div>
            <div class="post-actions">
                <div class="reactions-wrapper" onmouseenter="showReactionsPopover(${p.id}, 'post')" onmouseleave="hideReactionsPopover(${p.id}, 'post')">
                    <button class="action-btn like-btn ${hasViewerReaction ? viewerReactionItem.class : ''}" onclick="handleLikeClick(${p.id}, '${hasViewerReaction || ''}')">
                        ${hasViewerReaction ? `${viewerReactionItem.emoji} ${viewerReactionItem.label}` : '<i class="far fa-thumbs-up"></i> Like'}
                    </button>
                    <div class="reactions-popover" id="post-reactions-popover-${p.id}">
                        ${Object.entries(REACTION_MAP).map(([type, item]) => `
                            <span class="reaction-emoji-btn" data-tooltip="${item.label}" onclick="submitReaction(${p.id}, '${type}')">${item.emoji}</span>
                        `).join('')}
                    </div>
                </div>
                <button class="action-btn comment-btn" onclick="toggleComments(${p.id})"><i class="fas fa-comment"></i> Comment</button>
                <button class="action-btn share-btn" onclick="sharePost(${p.id})"><i class="fas fa-share"></i> Share</button>
            </div>
            <div class="comments-section" id="comments-${p.id}" style="display:none;">
                <div class="comments-list" id="list-${p.id}"></div>
                <div class="comment-input-area">
                    <input type="text" placeholder="Write a comment..." id="input-${p.id}">
                    <button onclick="addComment(${p.id})"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>`;
            c.appendChild(el);
            renderCommentsList(p.id, comments);
        }
    } catch(e){
        console.error(e);
        showNotification(e.message || 'Failed to load posts','error');
        c.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
}

function toggleComments(id){const s=document.getElementById('comments-'+id);if(s)s.style.display=s.style.display==='none'?'block':'none';}

async function toggleLike(postId){
    // Deprecated in favor of handles
    await handleLikeClick(postId, null);
}

async function addComment(postId){
    const inp=document.getElementById('input-'+postId);if(!inp||!inp.value.trim())return;
    try{
        const r=await fetch(`${API_URL}/posts/${postId}/comment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,content:inp.value})});
        if(r.ok){
            inp.value='';
            showNotification('Comment added!');
            const cr = await fetch(`${API_URL}/posts/${postId}/comments?viewerId=${currentUser.id}`);
            const comments = await cr.json();
            renderCommentsList(postId, comments);
            fetchPosts(); // Refresh stats count
        }
    }catch(e){showNotification('Failed','error');}
}

async function sharePost(postId){
    try{const r=await fetch(`${API_URL}/posts/${postId}/share`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id})});
    if(r.ok){showNotification('Shared!');fetchPosts();}}catch(e){showNotification('Failed','error');}
}

async function fetchFriendsSidebar(){
    const c=document.getElementById('friends-list');if(!c)return;
    try{const r=await fetch(`${API_URL}/friends/${currentUser.id}`);const friends=await r.json();
    if(!friends.length){c.innerHTML='<p style="color:var(--text-muted);font-size:0.9rem;">No friends yet.</p>';return;}
    c.innerHTML=friends.map(f=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;"><img src="${f.profile_pic||'https://via.placeholder.com/32'}" style="width:32px;height:32px;border-radius:50%;"><span style="font-size:0.9rem;">${f.username}</span></div>`).join('');
    }catch(e){c.innerHTML='<p style="color:var(--text-muted);font-size:0.9rem;">Could not load friends.</p>';}
}

async function toggleCloseFriend(friendId, isClose) {
    try {
        const method = isClose ? 'DELETE' : 'POST';
        const url = isClose 
            ? `${API_URL}/users/${currentUser.id}/close-friends/${friendId}`
            : `${API_URL}/users/${currentUser.id}/close-friends`;
        
        const r = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: isClose ? undefined : JSON.stringify({ friendId })
        });
        
        if (r.ok) {
            showNotification(isClose ? 'Removed from Close Friends' : 'Added to Close Friends');
            initFriends();
        } else {
            throw new Error();
        }
    } catch(e) {
        showNotification('Failed to update Close Friends', 'error');
    }
}

// ===== FRIENDS PAGE =====
async function initFriends(){
    const reqC=document.getElementById('friend-requests');
    const listC=document.getElementById('friends-list-page');
    const sugC=document.getElementById('friend-suggestions');
    const searchInput = document.getElementById('friend-search-input');
    const searchResC = document.getElementById('friend-search-results');
    
    // Search logic
    if (searchInput && searchResC) {
        searchInput.addEventListener('input', debounce(async (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                searchResC.innerHTML = '';
                return;
            }
            try {
                const r = await fetch(`${API_URL}/users/search?q=${encodeURIComponent(query)}&currentUserId=${currentUser.id}`);
                const users = await r.json();
                if (!users.length) {
                    searchResC.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>No users found matching that name.</p></div>';
                    return;
                }
                searchResC.innerHTML = users.map(u => {
                    let actionBtn = '';
                    if (u.friend_status === 'accepted') {
                        actionBtn = `<button class="primary-btn" style="background:var(--border);color:var(--text);" disabled>Friends</button>`;
                    } else if (u.friend_status === 'pending') {
                        if (u.request_direction === 'sent') {
                            actionBtn = `<button class="primary-btn" style="background:var(--border);color:var(--text);" disabled>Request Sent</button>`;
                        } else {
                            actionBtn = `<button class="primary-btn" onclick="acceptFriend(${u.id})">Accept Request</button>`;
                        }
                    } else {
                        actionBtn = `<button class="primary-btn" onclick="addFriend(${u.id})">Add Friend</button>`;
                    }
                    return `<div class="friend-card glass-card">
                        <img src="${u.profile_pic || 'https://via.placeholder.com/80'}">
                        <h4>${u.username}</h4>
                        <div style="display:flex; gap:8px; flex-wrap: wrap; justify-content: center;">${actionBtn} <button class="danger-btn" style="padding:10px; border:none; border-radius:8px; cursor:pointer;" onclick="blockUser(${u.id})">Block</button></div>
                    </div>`;
                }).join('');
            } catch(err) {
                console.error(err);
            }
        }, 300));
    }

    // Load friends & Close friends list
    try{
        const r=await fetch(`${API_URL}/friends/${currentUser.id}`);
        const friends=await r.json();
        let closeFriends = [];
        try {
            const cfRes = await fetch(`${API_URL}/users/${currentUser.id}/close-friends`);
            closeFriends = await cfRes.json();
        } catch(e) {}

        if(listC){
            if(!friends.length) listC.innerHTML='<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-users"></i><p>No friends yet</p></div>';
            else listC.innerHTML=friends.map(f=> {
                const isClose = closeFriends.includes(f.id);
                const starColor = isClose ? '#f1c40f' : 'var(--text-light)';
                const starTitle = isClose ? 'Remove from Close Friends' : 'Add to Close Friends';
                return `<div class="friend-card glass-card">
                    <img src="${f.profile_pic||'https://via.placeholder.com/80'}">
                    <h4>${f.username}</h4>
                    <div style="display:flex; gap:8px; justify-content: center; align-items: center;">
                        <button class="primary-btn" onclick="window.location.href='messages.html?user=${f.id}'">Message</button>
                        <button class="danger-btn" style="padding:10px; border:none; border-radius:8px; cursor:pointer;" onclick="blockUser(${f.id})">Block</button>
                        <button class="nav-icon-btn" style="background:none; border:none; cursor:pointer; font-size:1.3rem; padding: 4px; color:${starColor}; width:auto; height:auto; display:flex;" onclick="toggleCloseFriend(${f.id}, ${isClose})" title="${starTitle}">
                            <i class="fas fa-star"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');
        }
    }catch(e){}
    // Load requests
    try{const r=await fetch(`${API_URL}/friends/requests/${currentUser.id}`);const reqs=await r.json();
    if(reqC){if(!reqs.length)reqC.innerHTML='<div class="empty-state" style="grid-column: 1/-1;"><p>No pending requests</p></div>';
    else reqC.innerHTML=reqs.map(f=>`<div class="friend-card glass-card"><img src="${f.profile_pic||'https://via.placeholder.com/80'}"><h4>${f.username}</h4><div style="display:flex; gap:8px;"><button class="primary-btn" onclick="acceptFriend(${f.id})">Confirm</button><button class="danger-btn" style="padding:10px; border:none; border-radius:8px; cursor:pointer;" onclick="rejectFriend(${f.id})">Delete</button></div></div>`).join('');}}catch(e){}
    // Load suggestions
    try{const r=await fetch(`${API_URL}/friends/suggestions/${currentUser.id}`);const sug=await r.json();
    if(sugC){if(!sug.length)sugC.innerHTML='<div class="empty-state" style="grid-column: 1/-1;"><p>No suggestions</p></div>';
    else sugC.innerHTML=sug.map(f=>`<div class="friend-card glass-card"><img src="${f.profile_pic||'https://via.placeholder.com/80'}"><h4>${f.username}</h4><button class="primary-btn" onclick="addFriend(${f.id})">Add Friend</button></div>`).join('');}}catch(e){}
}

async function addFriend(friendId){
    try{const r=await fetch(`${API_URL}/friends/request`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,friendId})});
    if(r.ok){showNotification('Friend request sent!');initFriends();
        // optionally force trigger search input update
        const evt = new Event('input');
        const sInp = document.getElementById('friend-search-input');
        if(sInp && sInp.value) sInp.dispatchEvent(evt);
    }}catch(e){showNotification('Failed','error');}
}
async function acceptFriend(friendId){
    try{const r=await fetch(`${API_URL}/friends/accept`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,friendId})});
    if(r.ok){showNotification('Friend added!');initFriends();
        const evt = new Event('input');
        const sInp = document.getElementById('friend-search-input');
        if(sInp && sInp.value) sInp.dispatchEvent(evt);
    }}catch(e){showNotification('Failed','error');}
}
async function rejectFriend(friendId){
    try{const r=await fetch(`${API_URL}/friends/reject`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,friendId})});
    if(r.ok){showNotification('Request removed!');initFriends();}}catch(e){showNotification('Failed','error');}
}

async function blockUser(blockId){
    if(!confirm('Are you sure you want to block this user?')) return;
    try{const r=await fetch(`${API_URL}/friends/block`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,blockId})});
    if(r.ok){showNotification('User blocked!');initFriends();
        const evt = new Event('input');
        const sInp = document.getElementById('friend-search-input');
        if(sInp && sInp.value) sInp.dispatchEvent(evt);
    }}catch(e){showNotification('Failed to block','error');}
}

async function unblockUser(blockId){
    try{const r=await fetch(`${API_URL}/friends/unblock`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,blockId})});
    if(r.ok){showNotification('User unblocked!');initFriends();
    }}catch(e){showNotification('Failed to unblock','error');}
}

// ===== MESSAGES PAGE =====
let activeChatUser=null;
async function initMessages(){
    const params=new URLSearchParams(window.location.search);
    const targetUser=params.get('user');
    await loadConversations();
    if(targetUser)openChat(parseInt(targetUser));
}

async function loadConversations(){
    const c=document.getElementById('conversations');if(!c)return;
    try{const r=await fetch(`${API_URL}/messages/conversations/${currentUser.id}`);const convos=await r.json();
    if(!convos.length){
        // Show all users as potential conversations
        const ur=await fetch(`${API_URL}/users`);const users=await ur.json();
        c.innerHTML=users.filter(u=>u.id!==currentUser.id).map(u=>`<div class="conversation-item" onclick="openChat(${u.id})"><img src="${u.profile_pic||'https://via.placeholder.com/44'}"><div class="conv-info"><div class="conv-name">${u.username}</div><div class="conv-preview">Start a conversation</div></div></div>`).join('');
        return;
    }
    c.innerHTML=convos.map(cv=>`<div class="conversation-item${activeChatUser===cv.other_user_id?' active':''}" onclick="openChat(${cv.other_user_id})"><img src="${cv.profile_pic||'https://via.placeholder.com/44'}"><div class="conv-info"><div class="conv-name">${cv.username}</div><div class="conv-preview">${cv.last_message||''}</div></div>${cv.unread_count>0?`<div class="conv-unread">${cv.unread_count}</div>`:''}</div>`).join('');
    }catch(e){c.innerHTML='<p style="padding:16px;color:var(--text-muted);">Could not load chats.</p>';}
}

// WebRTC and Media Logic Variables
let localStream = null;
let peerConnection = null;
const configuration = { 'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}] };

function renderMessageHtml(m) {
    let contentHtml = `<div>${m.content}</div>`;
    if (m.message_type === 'voice' && m.media_url) {
        contentHtml = `<audio src="${m.media_url}" controls style="max-width: 200px; height: 30px;"></audio>`;
    } else if (m.message_type === 'location' && m.media_url) {
        contentHtml = `<a href="${m.media_url}" target="_blank" style="color:#3498db; text-decoration:none; font-weight:bold;"><i class="fas fa-map-marker-alt"></i> Location</a>`;
    } else if (m.message_type === 'gif' && m.media_url) {
        contentHtml = `<img src="${m.media_url}" style="max-width:200px; border-radius:8px;">`;
    } else if (m.message_type === 'call_log') {
        contentHtml = `<div style="color:var(--text-muted); font-style:italic;"><i class="fas fa-phone"></i> ${m.content}</div>`;
    }

    let readStatus = '';
    if (m.sender_id === currentUser.id && m.is_read) {
        const readTime = m.read_at ? new Date(m.read_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        readStatus = `<div class="msg-read-status" style="font-size: 0.7rem; color: var(--primary); text-align: right; margin-top: 4px;">Seen ${readTime}</div>`;
    }

    return `<div class="chat-msg ${m.sender_id===currentUser.id?'sent':'received'}" data-id="${m.id}">
                ${contentHtml}
                <div class="msg-time">${timeAgo(m.created_at)}</div>
                ${readStatus}
            </div>`;
}

async function openChat(otherId){
    activeChatUser=otherId;
    const area=document.getElementById('chat-area');if(!area)return;
    let username='User';
    try{const r=await fetch(`${API_URL}/users`);const users=await r.json();const u=users.find(x=>x.id===otherId);if(u)username=u.username;}catch(e){}
    let msgs=[];
    try{const r=await fetch(`${API_URL}/messages/${currentUser.id}/${otherId}`);msgs=await r.json();}catch(e){}
    area.innerHTML=`
        <div class="chat-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div>${username}</div>
            <div style="display:flex; gap:8px;">
                <button class="nav-icon-btn" onclick="startCall(${otherId}, false)" title="Audio Call"><i class="fas fa-phone"></i></button>
                <button class="nav-icon-btn" onclick="startCall(${otherId}, true)" title="Video Call"><i class="fas fa-video"></i></button>
            </div>
        </div>
        <div class="chat-messages" id="chat-msgs" onscroll="handleChatScroll(${otherId})">
            ${msgs.map(renderMessageHtml).join('')}
        </div>
        <div class="chat-input" style="display:flex; gap:8px; align-items:center;">
            <button class="nav-icon-btn" onclick="document.getElementById('gif-modal').style.display='flex'" title="Send GIF"><i class="fas fa-gift"></i></button>
            <button class="nav-icon-btn" onclick="sendLocation(${otherId})" title="Send Location"><i class="fas fa-map-marker-alt"></i></button>
            <input type="text" id="chat-input" placeholder="Type a message..." style="flex:1;">
            <button class="nav-icon-btn" id="voice-record-btn" onmousedown="startVoiceRecord()" onmouseup="stopVoiceRecord(${otherId})" title="Hold to record voice"><i class="fas fa-microphone"></i></button>
            <button class="primary-btn" onclick="sendTextMessage(${otherId})">Send</button>
        </div>
    `;
    const msgsDiv=document.getElementById('chat-msgs');if(msgsDiv)msgsDiv.scrollTop=msgsDiv.scrollHeight;
    
    const inp=document.getElementById('chat-input');
    let typingTimeout = null;
    if(inp){
        inp.addEventListener('input', () => {
            if (socket) {
                socket.emit('typing', { senderId: currentUser.id, receiverId: otherId, isTyping: true });
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    socket.emit('typing', { senderId: currentUser.id, receiverId: otherId, isTyping: false });
                }, 2000);
            }
        });
        inp.addEventListener('keypress',e=>{if(e.key==='Enter')sendTextMessage(otherId);});
    }
    loadConversations();
    setTimeout(() => handleChatScroll(otherId), 100);
}

async function sendTextMessage(receiverId) {
    const inp=document.getElementById('chat-input');if(!inp||!inp.value.trim())return;
    await sendApiMessage(receiverId, inp.value, 'text', null);
    inp.value='';
}

async function sendGif(url) {
    document.getElementById('gif-modal').style.display='none';
    if(activeChatUser) await sendApiMessage(activeChatUser, 'Sent a GIF', 'gif', url);
}

async function sendLocation(receiverId) {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const url = `https://www.google.com/maps?q=${lat},${lng}`;
            await sendApiMessage(receiverId, 'Shared a location', 'location', url);
        }, (err) => {
            showNotification('Location access denied', 'error');
        });
    } else {
        showNotification('Geolocation not supported', 'error');
    }
}

let mediaRecorder;
let audioChunks = [];

async function startVoiceRecord() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => { if(e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.start();
        document.getElementById('voice-record-btn').style.color = 'red';
    } catch(err) {
        showNotification('Microphone access denied', 'error');
    }
}

async function stopVoiceRecord(receiverId) {
    if(mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('voice-record-btn').style.color = '';
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('file', audioBlob, 'voicememo.webm');
            try {
                const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
                const uploadData = await uploadRes.json();
                if (uploadRes.ok) {
                    await sendApiMessage(receiverId, 'Voice message', 'voice', uploadData.url);
                }
            } catch(e) {
                showNotification('Failed to send voice memo', 'error');
            }
        };
    }
}

async function sendApiMessage(receiverId, content, messageType, mediaUrl) {
    try {
        if (socket) socket.emit('typing', { senderId: currentUser.id, receiverId, isTyping: false });
        const r=await fetch(`${API_URL}/messages`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({senderId:currentUser.id, receiverId, content, messageType, mediaUrl})
        });
        if(r.ok){
            const data = await r.json();
            appendRealtimeMessage(data.data);
            loadConversations();
        } else throw new Error();
    }catch(e){
        showNotification('Failed to send','error');
    }
}

function handleChatScroll(otherId) {
    const msgsDiv=document.getElementById('chat-msgs');
    if(!msgsDiv)return;
    if (msgsDiv.scrollHeight - msgsDiv.scrollTop <= msgsDiv.clientHeight + 50) {
        const unreadMsgs = Array.from(msgsDiv.querySelectorAll('.chat-msg.received:not(.read-acked)'));
        if (unreadMsgs.length > 0) {
            unreadMsgs.forEach(msg => {
                msg.classList.add('read-acked');
                const msgId = msg.getAttribute('data-id');
                if (msgId) {
                    fetch(`${API_URL}/messages/${msgId}/read-exact`, {method:'PUT'})
                        .then(r => r.json())
                        .then(data => {
                            if(socket && data.read_at) {
                                socket.emit('read-receipt', {
                                    senderId: currentUser.id,
                                    receiverId: otherId,
                                    messageId: msgId,
                                    time: data.read_at
                                });
                            }
                        });
                }
            });
            fetch(`${API_URL}/messages/${currentUser.id}/${otherId}`);
        }
    }
}

function appendRealtimeMessage(msg) {
    const msgsDiv = document.getElementById('chat-msgs');
    if (!msgsDiv) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMessageHtml(msg);
    const msgEl = wrapper.firstElementChild;
    msgsDiv.appendChild(msgEl);
    msgsDiv.scrollTop = msgsDiv.scrollHeight;
    handleChatScroll(activeChatUser);
}

// Call state variables for muting and switching camera
let currentFacingMode = 'user';

function resetCallButtons() {
    const aBtn = document.getElementById('mute-audio-btn');
    if(aBtn) { aBtn.innerHTML = '<i class="fas fa-microphone"></i>'; aBtn.style.background = '#333'; }
    const vBtn = document.getElementById('mute-video-btn');
    if(vBtn) { vBtn.innerHTML = '<i class="fas fa-video"></i>'; vBtn.style.background = '#333'; }
    currentFacingMode = 'user';
}

function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById('mute-audio-btn');
            if (btn) {
                btn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
                btn.style.background = audioTrack.enabled ? '#333' : '#e74c3c';
            }
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById('mute-video-btn');
            if (btn) {
                btn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
                btn.style.background = videoTrack.enabled ? '#333' : '#e74c3c';
            }
        }
    }
}

async function switchCamera() {
    if (localStream && peerConnection) {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        try {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) videoTrack.stop();

            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode },
                audio: false
            });
            const newVideoTrack = newStream.getVideoTracks()[0];

            localStream.removeTrack(videoTrack);
            localStream.addTrack(newVideoTrack);
            const localVideo = document.getElementById('local-video');
            if (localVideo) localVideo.srcObject = localStream;

            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) await sender.replaceTrack(newVideoTrack);
        } catch(e) {
            showNotification('Failed to switch camera', 'error');
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        }
    }
}

// WebRTC Call Logic
async function startCall(otherId, isVideo) {
    document.getElementById('call-modal').style.display = 'flex';
    document.getElementById('call-status').innerText = 'Calling...';
    resetCallButtons();
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = localStream;
        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = e => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo.srcObject !== e.streams[0]) remoteVideo.srcObject = e.streams[0];
        };
        peerConnection.onicecandidate = e => {
            if (e.candidate) socket.emit('ice-candidate', { to: otherId, candidate: e.candidate });
        };
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { userToCall: otherId, callerId: currentUser.id, offer: offer, isVideo: isVideo });
        await sendApiMessage(otherId, `Started a ${isVideo ? 'video' : 'audio'} call`, 'call_log', null);
    } catch(e) {
        showNotification('Could not access media devices', 'error');
        closeCallUI();
    }
}

async function acceptCall(offer, callerId, isVideo) {
    document.getElementById('incoming-call-overlay').style.display = 'none';
    document.getElementById('call-modal').style.display = 'flex';
    document.getElementById('call-status').innerText = 'Connected';
    resetCallButtons();
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = localStream;
        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = e => { document.getElementById('remote-video').srcObject = e.streams[0]; };
        peerConnection.onicecandidate = e => {
            if (e.candidate) socket.emit('ice-candidate', { to: callerId, candidate: e.candidate });
        };
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('make-answer', { answer: answer, to: callerId });
    } catch(e) {
        showNotification('Could not access media devices', 'error');
        closeCallUI();
    }
}

function closeCallUI() {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    document.getElementById('call-modal').style.display = 'none';
    document.getElementById('local-video').srcObject = null;
    document.getElementById('remote-video').srcObject = null;
}

document.addEventListener('DOMContentLoaded', () => {
    const endBtn = document.getElementById('end-call-btn');
    if (endBtn) {
        endBtn.onclick = () => {
            if(activeChatUser) socket.emit('end-call', { to: activeChatUser });
            closeCallUI();
        };
    }

    const muteAudioBtn = document.getElementById('mute-audio-btn');
    if (muteAudioBtn) muteAudioBtn.onclick = toggleAudio;

    const muteVideoBtn = document.getElementById('mute-video-btn');
    if (muteVideoBtn) muteVideoBtn.onclick = toggleVideo;

    const switchCameraBtn = document.getElementById('switch-camera-btn');
    if (switchCameraBtn) switchCameraBtn.onclick = switchCamera;
});

// ===== REELS PAGE =====
async function initReels(){
    const c=document.getElementById('reels-container');if(!c)return;
    try{const r=await fetch(`${API_URL}/reels`);const reels=await r.json();
    if(!reels.length){c.innerHTML='<div class="empty-state"><i class="fas fa-film"></i><p>No reels yet. Create the first one!</p></div>';return;}
    c.innerHTML=reels.map(rl=>`<div class="reel-card"><div class="reel-placeholder"><i class="fas fa-play-circle"></i><p>${rl.video_url?'Video':'No video'}</p></div><div class="reel-info"><div class="reel-user">@${rl.username}</div><div class="reel-caption">${rl.caption||''}</div></div></div>`).join('');
    }catch(e){showNotification('Failed to load reels','error');}
}

// ===== NOTIFICATIONS PAGE =====
async function initNotifications(){
    const c=document.getElementById('notifications-list');if(!c)return;
    const markBtn=document.getElementById('mark-all-read-btn');
    if(markBtn)markBtn.onclick=async()=>{try{await fetch(`${API_URL}/notifications/${currentUser.id}/read-all`,{method:'PUT'});initNotifications();showNotification('All marked as read');}catch(e){}};
    try{const r=await fetch(`${API_URL}/notifications/${currentUser.id}`);const notifs=await r.json();
    if(!notifs.length){c.innerHTML='<div class="empty-state" style="padding:40px;"><i class="fas fa-bell-slash"></i><p>No notifications yet</p></div>';return;}
    c.innerHTML=notifs.map(n=>`<div class="notification-item${n.is_read?'':' unread'}" onclick="markNotifRead(${n.id},this)"><img src="${n.sender_pic||'https://via.placeholder.com/44'}"><div class="notif-content"><div class="notif-text">${n.message}</div><div class="notif-time">${timeAgo(n.created_at)}</div></div>${n.is_read?'':`<div class="notif-dot"></div>`}</div>`).join('');
    }catch(e){showNotification('Failed to load notifications','error');}
}

async function markNotifRead(id,el){
    try{await fetch(`${API_URL}/notifications/${id}/read`,{method:'PUT'});if(el){el.classList.remove('unread');const dot=el.querySelector('.notif-dot');if(dot)dot.remove();}}catch(e){}
}

// ===== MARKETPLACE PAGE =====
async function initMarketplace(){
    const c=document.getElementById('marketplace-list');if(!c)return;
    const btn=document.getElementById('list-item-btn');if(btn)btn.onclick=()=>openModal('marketplace');
    try{const r=await fetch(`${API_URL}/marketplace`);const items=await r.json();
    if(!items.length){c.innerHTML='<div class="empty-state"><i class="fas fa-store"></i><p>No items listed yet. Be the first!</p></div>';return;}
    c.innerHTML=items.map(it=>`<div class="market-card glass-card"><div class="market-img">${it.image_url?`<img src="${it.image_url}" style="width:100%;height:100%;object-fit:cover;">`:'<i class="fas fa-image"></i>'}</div><div class="market-info"><div class="market-price">$${parseFloat(it.price).toFixed(2)}</div><div class="market-name">${it.item_name}</div><div class="market-seller">Listed by ${it.username}</div></div></div>`).join('');
    }catch(e){showNotification('Failed to load marketplace','error');}
}

// ===== SETTINGS PAGE =====
async function initSettings() {
    const categories = document.querySelectorAll('.settings-cat');
    const content = document.getElementById('settings-content');
    
    // Load current user data
    try {
        const r = await fetch(`${API_URL}/users/${currentUser.id}`);
        const user = await r.json();
        
        const renderCategory = (cat) => {
            categories.forEach(c => c.classList.remove('active'));
            const catEl = document.querySelector(`[data-cat="${cat}"]`);
            if(catEl) catEl.classList.add('active');
            
            let html = '';
            switch(cat) {
                case 'profile':
                    html = `
                        <h2>Profile Settings</h2>
                        <div class="settings-group">
                            <label>Username</label>
                            <input type="text" id="set-username" value="${user.username}">
                        </div>
                        <div class="settings-group">
                            <label>Bio</label>
                            <textarea id="set-bio" placeholder="Tell us about yourself...">${user.bio || ''}</textarea>
                        </div>
                        <div class="settings-group">
                            <label>Profile Picture</label>
                            <input type="file" id="set-pic-input" accept="image/*">
                            <div id="set-pic-preview" style="margin-top:10px;">
                                <img src="${user.profile_pic}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">
                            </div>
                        </div>
                        <button class="primary-btn" onclick="saveProfileSettings()">Save Profile</button>
                    `;
                    break;
                case 'account':
                    html = `
                        <h2>Account Settings</h2>
                        <div class="settings-group">
                            <label>Email Address</label>
                            <input type="email" id="set-email" value="${user.email}">
                        </div>
                        <div class="settings-group">
                            <label>New Password</label>
                            <input type="password" id="set-password" placeholder="Leave blank to keep current">
                        </div>
                        <button class="primary-btn" onclick="saveAccountSettings()">Update Account</button>
                        <hr style="margin:24px 0; border:0; border-top:1px solid var(--border);">
                        <h3 style="color:var(--error);">Danger Zone</h3>
                        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:12px;">Once you delete your account, there is no going back. Please be certain.</p>
                        <button class="danger-btn" onclick="deleteAccount()">Delete Account</button>
                    `;
                    break;
                case 'privacy':
                    const priv = user.privacy_settings || {};
                    html = `
                        <h2>Privacy Settings</h2>
                        <div class="settings-group">
                            <label>Who can message me?</label>
                            <select id="set-priv-msg">
                                <option value="everyone" ${priv.message === 'everyone' ? 'selected' : ''}>Everyone</option>
                                <option value="friends" ${priv.message === 'friends' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${priv.message === 'nobody' ? 'selected' : ''}>Nobody</option>
                            </select>
                        </div>
                        <div class="settings-group">
                            <label>Story Visibility</label>
                            <select id="set-priv-story">
                                <option value="public" ${priv.story === 'public' ? 'selected' : ''}>Public</option>
                                <option value="friends" ${priv.story === 'friends' ? 'selected' : ''}>Friends Only</option>
                                <option value="private" ${priv.story === 'private' ? 'selected' : ''}>Only Me</option>
                            </select>
                        </div>
                        <div class="settings-group toggle-group">
                            <span>Online Visibility</span>
                            <input type="checkbox" id="set-priv-lastseen" ${priv.last_seen === 'everyone' ? 'checked' : ''}>
                        </div>
                        <button class="primary-btn" onclick="saveAllSettings()">Save Privacy</button>
                    `;
                    break;
                case 'notifications':
                    const notif = user.notification_settings || {};
                    html = `
                        <h2>Notification Settings</h2>
                        <div class="settings-group toggle-group">
                            <span>Message Notifications</span>
                            <input type="checkbox" id="set-notif-msg" ${notif.messages ? 'checked' : ''}>
                        </div>
                        <div class="settings-group toggle-group">
                            <span>Story Notifications</span>
                            <input type="checkbox" id="set-notif-story" ${notif.stories ? 'checked' : ''}>
                        </div>
                        <div class="settings-group toggle-group">
                            <span>Sound Effects</span>
                            <input type="checkbox" id="set-notif-sound" ${notif.sounds ? 'checked' : ''}>
                        </div>
                        <button class="primary-btn" onclick="saveAllSettings()">Save Notifications</button>
                    `;
                    break;
                case 'appearance':
                    const appr = user.appearance_settings || {};
                    html = `
                        <h2>Appearance</h2>
                        <div class="settings-group">
                            <label>Theme</label>
                            <div class="theme-options">
                                <div class="theme-box ${appr.theme === 'light' ? 'active' : ''}" onclick="setTheme('light')">Light</div>
                                <div class="theme-box ${appr.theme === 'dark' ? 'active' : ''}" style="background:#1a1a1a;color:white;" onclick="setTheme('dark')">Dark</div>
                            </div>
                        </div>
                        <div class="settings-group">
                            <label>Primary Color</label>
                            <div class="color-options">
                                <div class="color-circle" style="background:#4834d4;" onclick="setColor('#4834d4')"></div>
                                <div class="color-circle" style="background:#eb4d4b;" onclick="setColor('#eb4d4b')"></div>
                                <div class="color-circle" style="background:#6ab04c;" onclick="setColor('#6ab04c')"></div>
                                <div class="color-circle" style="background:#f0932b;" onclick="setColor('#f0932b')"></div>
                            </div>
                        </div>
                        <button class="primary-btn" onclick="saveAllSettings()">Save Appearance</button>
                    `;
                    break;
                default:
                    html = `<h2>Coming Soon</h2><p>This section is under development.</p>`;
            }
            content.innerHTML = html;
            
            if(cat === 'profile') {
                const picInput = document.getElementById('set-pic-input');
                const picPreview = document.getElementById('set-pic-preview');
                if(picInput && picPreview) {
                    picInput.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (re) => {
                                picPreview.innerHTML = `<img src="${re.target.result}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`;
                            };
                            reader.readAsDataURL(file);
                            window.selectedSettingsPic = file;
                        }
                    };
                }
            }
        };

        categories.forEach(c => {
            c.onclick = () => renderCategory(c.dataset.cat);
        });

        renderCategory('profile');

    } catch(e) {
        showNotification('Failed to load settings','error');
    }
}

async function saveProfileSettings() {
    const username = document.getElementById('set-username').value;
    const bio = document.getElementById('set-bio').value;
    
    try {
        let profilePic = currentUser.profile_pic;
        if (window.selectedSettingsPic) {
            const formData = new FormData();
            formData.append('file', window.selectedSettingsPic);
            const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();
            profilePic = uploadData.url;
        }

        const r = await fetch(`${API_URL}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, bio, profilePic })
        });

        if (r.ok) {
            const resData = await r.json();
            localStorage.setItem('user', JSON.stringify({ ...currentUser, username: resData.user.username, profile_pic: resData.user.profile_pic }));
            showNotification('Profile updated!');
            location.reload();
        }
    } catch(e) {
        showNotification('Failed to save profile','error');
    }
}

async function saveAccountSettings() {
    const email = document.getElementById('set-email').value;
    const password = document.getElementById('set-password').value;
    
    try {
        const r = await fetch(`${API_URL}/users/${currentUser.id}/account`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: password || null })
        });

        if (r.ok) {
            showNotification('Account updated!');
        }
    } catch(e) {
        showNotification('Failed to update account','error');
    }
}

async function saveAllSettings() {
    const privacy = {
        message: document.getElementById('set-priv-msg')?.value,
        story: document.getElementById('set-priv-story')?.value,
        last_seen: document.getElementById('set-priv-lastseen')?.checked ? 'everyone' : 'nobody'
    };
    
    const notifications = {
        messages: document.getElementById('set-notif-msg')?.checked,
        stories: document.getElementById('set-notif-story')?.checked,
        sounds: document.getElementById('set-notif-sound')?.checked
    };
    
    const appearance = window.currentAppearance || {};

    try {
        const r = await fetch(`${API_URL}/users/${currentUser.id}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privacy, notifications, appearance })
        });

        if (r.ok) {
            showNotification('Settings saved!');
        }
    } catch(e) {
        showNotification('Failed to save settings','error');
    }
}

function setTheme(theme) {
    window.currentAppearance = { ...window.currentAppearance, theme };
    document.querySelectorAll('.theme-box').forEach(b => b.classList.remove('active'));
    if(theme === 'dark') document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
}

function setColor(color) {
    window.currentAppearance = { ...window.currentAppearance, color };
    document.documentElement.style.setProperty('--primary', color);
}

async function deleteAccount() {
    if (confirm('Are you absolutely sure? This cannot be undone.')) {
        try {
            const r = await fetch(`${API_URL}/users/${currentUser.id}`, { method: 'DELETE' });
            if (r.ok) {
                localStorage.removeItem('user');
                window.location.href = 'login.html';
            }
        } catch(e) {}
    }
}

async function applyAppearanceSettings() {
    if (!currentUser) return;
    try {
        const r = await fetch(`${API_URL}/users/${currentUser.id}`);
        const user = await r.json();
        const appr = user.appearance_settings || {};
        window.currentAppearance = appr;
        
        if (appr.theme === 'dark') document.body.classList.add('dark-mode');
        if (appr.color) document.documentElement.style.setProperty('--primary', appr.color);
    } catch(e) {}
}

if (currentUser) applyAppearanceSettings();
init();

// ============================================================
// --- Nuanced Reactions Handlers ---
// ============================================================

const REACTION_MAP = {
    like: { emoji: '👍', label: 'Like', class: 'reacted-like' },
    love: { emoji: '❤️', label: 'Love', class: 'reacted-love' },
    care: { emoji: '🤗', label: 'Care', class: 'reacted-care' },
    haha: { emoji: '😂', label: 'Haha', class: 'reacted-haha' },
    wow: { emoji: '😮', label: 'Wow', class: 'reacted-wow' },
    sad: { emoji: '😢', label: 'Sad', class: 'reacted-sad' },
    angry: { emoji: '😡', label: 'Angry', class: 'reacted-angry' }
};

function renderReactionsSummary(summary, totalCount) {
    if (!totalCount || totalCount <= 0) return '<span></span>';
    const entries = Object.entries(summary || {}).filter(([_, count]) => count > 0).sort((a, b) => b[1] - a[1]);
    const emojis = entries.slice(0, 3).map(([type]) => {
        const map = REACTION_MAP[type];
        return `<span class="sum-emoji">${map ? map.emoji : '👍'}</span>`;
    }).join('');
    
    return `
        <div class="post-reactions-display">
            <span class="reaction-summary-emojis">${emojis}</span>
            <span style="margin-left: 6px; font-weight: 500;">${totalCount}</span>
        </div>
    `;
}

let reactionPopoverTimeouts = {};

function showReactionsPopover(id, type) {
    const key = `${type}-${id}`;
    if (reactionPopoverTimeouts[key]) {
        clearTimeout(reactionPopoverTimeouts[key]);
        delete reactionPopoverTimeouts[key];
    }
    const popover = document.getElementById(`${type}-reactions-popover-${id}`);
    if (popover) popover.classList.add('show');
}

function hideReactionsPopover(id, type) {
    const key = `${type}-${id}`;
    reactionPopoverTimeouts[key] = setTimeout(() => {
        const popover = document.getElementById(`${type}-reactions-popover-${id}`);
        if (popover) popover.classList.remove('show');
    }, 450);
}

async function handleLikeClick(postId, currentReaction) {
    const targetReaction = currentReaction ? currentReaction : 'like';
    await submitReaction(postId, targetReaction);
}

async function submitReaction(postId, reactionType) {
    try {
        const r = await fetch(`${API_URL}/posts/${postId}/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, reactionType })
        });
        const d = await r.json();
        if (r.ok) {
            showNotification(d.message);
            fetchPosts();
        }
    } catch (e) {
        showNotification('Failed to submit reaction', 'error');
    }
}

async function handleCommentLikeClick(commentId, currentReaction, postId) {
    const targetReaction = currentReaction ? currentReaction : 'like';
    await submitCommentReaction(commentId, targetReaction, postId);
}

async function submitCommentReaction(commentId, reactionType, postId) {
    try {
        const r = await fetch(`${API_URL}/comments/${commentId}/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, reactionType })
        });
        const d = await r.json();
        if (r.ok) {
            showNotification(d.message);
            
            // Reload comments list for the post
            const list = document.getElementById('list-' + postId);
            if (list) {
                const cr = await fetch(`${API_URL}/posts/${postId}/comments?viewerId=${currentUser.id}`);
                const comments = await cr.json();
                renderCommentsList(postId, comments);
            }
        }
    } catch (e) {
        showNotification('Failed to react to comment', 'error');
    }
}

function renderCommentsList(postId, comments) {
    const list = document.getElementById('list-' + postId);
    if (!list) return;
    list.innerHTML = comments.map(cm => {
        const hasViewerReaction = cm.viewer_reaction;
        const viewerReactionItem = REACTION_MAP[hasViewerReaction];
        const reactionSummaryHtml = cm.reactions_count > 0 ? `
            <span class="comment-reactions-summary" title="${Object.entries(cm.reactions_summary || {}).map(([t, c]) => `${REACTION_MAP[t].label}: ${c}`).join(', ')}">
                ${Object.entries(cm.reactions_summary || {}).filter(([_, count]) => count > 0).slice(0, 2).map(([t]) => REACTION_MAP[t].emoji).join('')}
                <span style="font-size:0.75rem; font-weight:600; margin-left: 2px;">${cm.reactions_count}</span>
            </span>
        ` : '';

        return `
            <div class="comment" style="margin-bottom: 12px; position:relative;">
                <div style="background: var(--hover-bg); padding: 8px 12px; border-radius: 18px; display: inline-block; max-width: 85%;">
                    <span class="comment-user" style="font-weight:700; color:var(--text); margin-right:4px; cursor:pointer;" onclick="window.location.href='profile.html?id=${cm.user_id}'">${cm.username}</span>
                    <span class="comment-text" style="color:var(--text); word-break: break-word;">${cm.content}</span>
                </div>
                ${reactionSummaryHtml ? `<div style="display:inline-flex; align-items:center; margin-left:6px; vertical-align:middle;">${reactionSummaryHtml}</div>` : ''}
                <div class="comment-actions" style="display:flex; align-items:center; gap:12px; font-size:0.75rem; margin-top:2px; padding-left:8px;">
                    <div class="reactions-wrapper" onmouseenter="showReactionsPopover(${cm.id}, 'comment')" onmouseleave="hideReactionsPopover(${cm.id}, 'comment')">
                        <span class="comment-action-btn ${hasViewerReaction ? viewerReactionItem.class : ''}" style="cursor:pointer;" onclick="handleCommentLikeClick(${cm.id}, '${hasViewerReaction || ''}', ${postId})">
                            ${hasViewerReaction ? viewerReactionItem.label : 'Like'}
                        </span>
                        <div class="reactions-popover comment-reactions-popover" id="comment-reactions-popover-${cm.id}">
                            ${Object.entries(REACTION_MAP).map(([type, item]) => `
                                <span class="reaction-emoji-btn" data-tooltip="${item.label}" onclick="submitCommentReaction(${cm.id}, '${type}', ${postId})">${item.emoji}</span>
                            `).join('')}
                        </div>
                    </div>
                    <span style="color:var(--text-muted);">${timeAgo(cm.created_at)}</span>
                </div>
            </div>
        `;
    }).join('');
}
