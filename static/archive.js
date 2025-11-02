// GTFS Archive Page JavaScript

let allUploads = [];
let filteredUploads = [];

// Initialize archive page - Optimized with error handling
function initArchivePage() {
    try {
        setupArchiveEventListeners();
        loadArchiveData();
    } catch (error) {
        console.error('Error initializing archive page:', error);
        showArchiveError('Error initializing archive page. Please refresh.');
    }
}

// Cleanup function for archive page
function cleanupArchivePage() {
    allUploads = [];
    filteredUploads = [];
}

// Setup event listeners
function setupArchiveEventListeners() {
    // Search
    const searchInput = document.getElementById('archive-search');
    if (searchInput) {
        searchInput.addEventListener('input', handleArchiveSearch);
    }
    
    // Sort
    const sortSelect = document.getElementById('archive-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', handleArchiveSort);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('archive-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadArchiveData();
        });
    }
    
    // Modal close
    const closeModal = document.getElementById('archive-close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', closeArchiveModal);
    }
    
    // Close modal on outside click
    const modal = document.getElementById('archive-detail-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeArchiveModal();
            }
        });
    }
}

// Load archive data
async function loadArchiveData() {
    const loading = document.getElementById('archive-loading');
    const empty = document.getElementById('archive-empty');
    const tableContainer = document.getElementById('archive-table-container');
    
    // Show loading
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'none';
    
    try {
        const response = await fetch('/api/gtfs-uploads');
        if (!response.ok) {
            throw new Error('Failed to load uploads');
        }
        
        allUploads = await response.json();
        filteredUploads = [...allUploads];
        
        // Apply current sort
        handleArchiveSort();
        
    } catch (error) {
        console.error('Error loading archive:', error);
        showArchiveError('Error loading archive data. Please try again.');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Handle search
function handleArchiveSearch(event) {
    const query = event.target.value.toLowerCase().trim();
    
    if (!query) {
        filteredUploads = [...allUploads];
    } else {
        filteredUploads = allUploads.filter(upload => {
            const name = (upload.name || '').toLowerCase();
            const notes = (upload.notes || '').toLowerCase();
            return name.includes(query) || notes.includes(query);
        });
    }
    
    // Apply current sort
    handleArchiveSort();
}

// Handle sort
function handleArchiveSort() {
    const sortSelect = document.getElementById('archive-sort');
    const sortValue = sortSelect ? sortSelect.value : 'date-desc';
    
    filteredUploads.sort((a, b) => {
        switch (sortValue) {
            case 'date-desc':
                return new Date(b.upload_date) - new Date(a.upload_date);
            case 'date-asc':
                return new Date(a.upload_date) - new Date(b.upload_date);
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'name-desc':
                return (b.name || '').localeCompare(a.name || '');
            case 'routes-desc':
                return (b.num_routes || 0) - (a.num_routes || 0);
            default:
                return 0;
        }
    });
    
    renderArchiveTable();
}

// Render archive table
function renderArchiveTable() {
    const tbody = document.getElementById('archive-table-body');
    const empty = document.getElementById('archive-empty');
    const tableContainer = document.getElementById('archive-table-container');
    
    if (!tbody) return;
    
    if (filteredUploads.length === 0) {
        if (empty) empty.style.display = 'block';
        if (tableContainer) tableContainer.style.display = 'none';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    
    tbody.innerHTML = '';
    
    filteredUploads.forEach(upload => {
        const row = createArchiveTableRow(upload);
        tbody.appendChild(row);
    });
}

// Create archive table row
function createArchiveTableRow(upload) {
    const row = document.createElement('tr');
    row.className = 'archive-row';
    
    // Format date
    const uploadDate = new Date(upload.upload_date);
    const dateStr = uploadDate.toLocaleDateString() + ' ' + uploadDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Format file size
    const fileSizeStr = upload.file_size ? formatFileSize(upload.file_size) : 'N/A';
    
    // Status badge
    const statusClass = upload.status === 'Parsed' ? 'status-success' : upload.status === 'Error' ? 'status-error' : 'status-pending';
    const statusBadge = `<span class="status-badge ${statusClass}">${upload.status || 'Unknown'}</span>`;
    
    row.innerHTML = `
        <td>
            <div class="archive-name">${escapeHtml(upload.name || 'Unnamed Dataset')}</div>
            ${upload.notes ? `<div class="archive-notes">${escapeHtml(upload.notes)}</div>` : ''}
        </td>
        <td>${dateStr}</td>
        <td>${upload.num_routes || 0}</td>
        <td>${upload.num_trips || 0}</td>
        <td>${upload.num_stops || 0}</td>
        <td>${statusBadge}</td>
        <td>
            <div class="archive-actions">
                <button class="btn-action btn-view" onclick="viewArchiveUpload(${upload.id})" title="View Details">
                    👁️ View
                </button>
                <button class="btn-action btn-reload" onclick="reloadArchiveUpload(${upload.id})" title="Reload as Active Dataset">
                    🔄 Reload
                </button>
                <button class="btn-action btn-delete" onclick="deleteArchiveUpload(${upload.id}, '${escapeHtml(upload.name)}')" title="Delete Dataset">
                    🗑️ Delete
                </button>
            </div>
        </td>
    `;
    
    return row;
}

// View upload details
async function viewArchiveUpload(uploadId) {
    const modal = document.getElementById('archive-detail-modal');
    const modalTitle = document.getElementById('archive-modal-title');
    const modalBody = document.getElementById('archive-modal-body');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Show modal
    modal.style.display = 'flex';
    modalBody.innerHTML = '<div class="loading">Loading dataset details...</div>';
    
    try {
        const response = await fetch(`/api/gtfs-uploads/${uploadId}`);
        if (!response.ok) {
            throw new Error('Failed to load upload details');
        }
        
        const upload = await response.json();
        modalTitle.textContent = upload.name || 'Dataset Details';
        
        // Format date
        const uploadDate = new Date(upload.upload_date);
        const dateStr = uploadDate.toLocaleString();
        
        // Format file size
        const fileSizeStr = upload.file_size ? formatFileSize(upload.file_size) : 'N/A';
        
        modalBody.innerHTML = `
            <div class="archive-detail">
                <div class="detail-section">
                    <h3>📋 Dataset Information</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>Name:</label>
                            <span>${escapeHtml(upload.name || 'Unnamed')}</span>
                        </div>
                        <div class="detail-item">
                            <label>Upload Date:</label>
                            <span>${dateStr}</span>
                        </div>
                        <div class="detail-item">
                            <label>File Size:</label>
                            <span>${fileSizeStr}</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="status-badge ${upload.status === 'Parsed' ? 'status-success' : upload.status === 'Error' ? 'status-error' : 'status-pending'}">${upload.status || 'Unknown'}</span>
                        </div>
                        ${upload.notes ? `
                        <div class="detail-item detail-full">
                            <label>Notes:</label>
                            <span>${escapeHtml(upload.notes)}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="detail-section">
                    <h3>📊 Statistics</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>Routes:</label>
                            <span class="detail-value">${upload.num_routes || 0}</span>
                        </div>
                        <div class="detail-item">
                            <label>Trips:</label>
                            <span class="detail-value">${upload.num_trips || 0}</span>
                        </div>
                        <div class="detail-item">
                            <label>Stops:</label>
                            <span class="detail-value">${upload.num_stops || 0}</span>
                        </div>
                        <div class="detail-item">
                            <label>Stop Times:</label>
                            <span class="detail-value">${upload.num_stop_times || 0}</span>
                        </div>
                    </div>
                </div>
                
                <div class="detail-actions">
                    <button class="btn-primary" onclick="reloadArchiveUpload(${upload.id}); closeArchiveModal();">
                        🔄 Reload as Active Dataset
                    </button>
                    <button class="btn-cancel" onclick="deleteArchiveUpload(${upload.id}, '${escapeHtml(upload.name)}'); closeArchiveModal();">
                        🗑️ Delete Dataset
                    </button>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading upload details:', error);
        modalBody.innerHTML = '<div class="error-message">Error loading dataset details. Please try again.</div>';
    }
}

// Reload upload (set as active)
async function reloadArchiveUpload(uploadId) {
    if (!confirm('Are you sure you want to reload this dataset as the active dataset? This will replace the current active data.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/gtfs-uploads/${uploadId}/reload`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reload dataset');
        }
        
        const result = await response.json();
        
        // Show success message
        showArchiveMessage('success', result.message || 'Dataset reloaded successfully!');
        
        // Refresh dashboard data if available
        setTimeout(() => {
            if (typeof loadKPIs === 'function') {
                loadKPIs();
            }
            if (typeof loadRoutes === 'function') {
                loadRoutes();
            }
            if (typeof loadStops === 'function') {
                loadStops();
            }
        }, 500);
        
        // Reload archive to update any status indicators
        setTimeout(() => {
            loadArchiveData();
        }, 1000);
        
    } catch (error) {
        console.error('Error reloading dataset:', error);
        showArchiveMessage('error', error.message || 'Failed to reload dataset. Please try again.');
    }
}

// Delete upload
async function deleteArchiveUpload(uploadId, uploadName) {
    const confirmMsg = `Are you sure you want to delete "${uploadName}"?\n\nThis action cannot be undone and will permanently remove all data for this dataset.`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/gtfs-uploads/${uploadId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete dataset');
        }
        
        const result = await response.json();
        
        // Show success message
        showArchiveMessage('success', result.message || 'Dataset deleted successfully!');
        
        // Reload archive
        setTimeout(() => {
            loadArchiveData();
        }, 500);
        
    } catch (error) {
        console.error('Error deleting dataset:', error);
        showArchiveMessage('error', error.message || 'Failed to delete dataset. Please try again.');
    }
}

// Close archive modal
function closeArchiveModal() {
    const modal = document.getElementById('archive-detail-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Utility functions
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showArchiveMessage(type, message) {
    // Create a temporary message element
    const messageEl = document.createElement('div');
    messageEl.className = `archive-message archive-message-${type}`;
    messageEl.textContent = message;
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#51cf66' : '#ff6b6b'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(messageEl);
    
    setTimeout(() => {
        messageEl.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => messageEl.remove(), 300);
    }, 3000);
}

function showArchiveError(message) {
    showArchiveMessage('error', message);
}

// Make functions available globally
window.initArchivePage = initArchivePage;
window.viewArchiveUpload = viewArchiveUpload;
window.reloadArchiveUpload = reloadArchiveUpload;
window.deleteArchiveUpload = deleteArchiveUpload;
window.closeArchiveModal = closeArchiveModal;

