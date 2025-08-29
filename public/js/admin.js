document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('user-email').textContent = 'barisha@yaani.com';
    loadAllFiles();
});

function loadAllFiles() {
    fetch('/files')
        .then(response => response.json())
        .then(files => {
            const filesList = document.getElementById('all-files-list');
            filesList.innerHTML = '';
            
            if (files.length === 0) {
                filesList.innerHTML = '<p>Henüz hiç dosya yüklenmedi.</p>';
                return;
            }
            
            files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                
                const fileInfo = document.createElement('div');
                fileInfo.innerHTML = `
                    <strong>${file.originalname}</strong> 
                    <span>(${formatFileSize(file.size)})</span>
                    <span>Kullanıcı: ${file.user_email}</span>
                    <span>Klasör: ${file.folder}</span>
                `;
                
                const fileActions = document.createElement('div');
                
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = 'İndir';
                downloadBtn.onclick = () => downloadFile(file.id);
                fileActions.appendChild(downloadBtn);
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Sil';
                deleteBtn.className = 'delete-btn';
                deleteBtn.onclick = () => deleteFile(file.id);
                fileActions.appendChild(deleteBtn);
                
                fileItem.appendChild(fileInfo);
                fileItem.appendChild(fileActions);
                filesList.appendChild(fileItem);
            });
        });
}

function deleteFile(fileId) {
    if (confirm('Bu dosyayı silmek istediğinize emin misiniz?')) {
        fetch(`/files/${fileId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            loadAllFiles();
        })
        .catch(error => {
            alert('Silme hatası: ' + error);
        });
    }
}

function downloadFile(fileId) {
    window.open(`/download/${fileId}`, '_blank');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
