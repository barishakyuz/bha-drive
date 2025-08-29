document.addEventListener('DOMContentLoaded', function() {
    // Kullanıcı emailini göster
    fetch('/user-info')
        .then(response => response.json())
        .then(data => {
            document.getElementById('user-email').textContent = data.email;
        });
    
    // Dosyaları yükle
    loadFiles();
});

function loadFiles() {
    fetch('/files')
        .then(response => response.json())
        .then(files => {
            const filesList = document.getElementById('files-list');
            filesList.innerHTML = '';
            
            if (files.length === 0) {
                filesList.innerHTML = '<p>Henüz dosya yüklenmedi.</p>';
                return;
            }
            
            files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                
                const fileInfo = document.createElement('div');
                fileInfo.innerHTML = `
                    <strong>${file.originalname}</strong> 
                    <span>(${formatFileSize(file.size)})</span>
                    <span>Klasör: ${file.folder}</span>
                `;
                
                const fileActions = document.createElement('div');
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = 'İndir';
                downloadBtn.onclick = () => downloadFile(file.id);
                fileActions.appendChild(downloadBtn);
                
                fileItem.appendChild(fileInfo);
                fileItem.appendChild(fileActions);
                filesList.appendChild(fileItem);
            });
        });
}

function uploadFiles() {
    const fileInput = document.getElementById('file-input');
    const folderName = document.getElementById('folder-name').value;
    const statusDiv = document.getElementById('upload-status');
    
    if (fileInput.files.length === 0) {
        statusDiv.textContent = 'Lütfen dosya seçin.';
        return;
    }
    
    const formData = new FormData();
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('files', fileInput.files[i]);
    }
    formData.append('folder', folderName);
    
    statusDiv.textContent = 'Dosyalar yükleniyor...';
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        statusDiv.textContent = data.message;
        fileInput.value = '';
        loadFiles();
    })
    .catch(error => {
        statusDiv.textContent = 'Yükleme hatası: ' + error;
    });
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
