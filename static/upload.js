// GTFS Upload Page JavaScript - Rebuilt with Progress Indicators

let uploadMap = null;
let uploadedStops = [];
let uploadStartTime = null;

// Initialize upload page
function initUploadPage() {
    setupFileUpload();
    resetUploadUI();
}

// Reset upload UI
function resetUploadUI() {
    const dropzone = document.getElementById('upload-dropzone');
    const progressContainer = document.getElementById('upload-progress-container');
    const uploadStatus = document.getElementById('upload-status');
    const dropzoneText = document.getElementById('dropzone-text');
    
    dropzone.style.pointerEvents = 'auto';
    dropzone.style.opacity = '1';
    progressContainer.style.display = 'none';
    uploadStatus.style.display = 'none';
    uploadStatus.textContent = '';
    dropzoneText.textContent = 'Click to select or drag & drop a GTFS ZIP file';
}

// Setup file upload handlers
function setupFileUpload() {
    const fileInput = document.getElementById('gtfs-file-input');
    const dropzone = document.getElementById('upload-dropzone');
    
    // Click to upload
    dropzone.addEventListener('click', () => {
        if (dropzone.style.pointerEvents !== 'none') {
            fileInput.click();
        }
    });
    
    // Drag and drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dropzone.style.pointerEvents !== 'none') {
            dropzone.classList.add('dragover');
        }
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        if (dropzone.style.pointerEvents === 'none') return;
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.zip')) {
            handleFileUpload(files[0]);
        } else {
            showUploadStatus('Please upload a .zip file', 'error');
        }
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

// Handle file upload with progress tracking
async function handleFileUpload(file) {
    const uploadStatus = document.getElementById('upload-status');
    const dropzone = document.getElementById('upload-dropzone');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressPercent = document.getElementById('progress-percent');
    const progressSteps = document.getElementById('progress-steps');
    const dropzoneText = document.getElementById('dropzone-text');
    
    // Reset UI
    resetUploadUI();
    uploadStartTime = Date.now();
    
    // Show file name
    dropzoneText.textContent = `Processing: ${file.name}`;
    
    // Disable dropzone
    dropzone.style.pointerEvents = 'none';
    dropzone.style.opacity = '0.6';
    
    // Show progress container
    progressContainer.style.display = 'block';
    progressStatus.textContent = 'Starting upload...';
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';
    
    // Initialize progress steps
    updateProgressSteps(progressSteps, [
        { id: 'extract', label: 'Extracting ZIP file', status: 'pending' },
        { id: 'analyze', label: 'Analyzing GTFS files', status: 'pending' },
        { id: 'copy', label: 'Copying files to active directory', status: 'pending' },
        { id: 'database', label: 'Storing in database', status: 'pending' },
        { id: 'complete', label: 'Upload complete', status: 'pending' }
    ]);
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Add optional dataset name and notes
    const datasetName = document.getElementById('dataset-name')?.value.trim();
    const datasetNotes = document.getElementById('dataset-notes')?.value.trim();
    
    if (datasetName) {
        formData.append('name', datasetName);
    }
    if (datasetNotes) {
        formData.append('notes', datasetNotes);
    }
    
    try {
        // Update progress: Starting
        updateProgress(progressBar, progressPercent, 5);
        updateStepStatus(progressSteps, 'extract', 'active');
        progressStatus.textContent = 'Extracting ZIP file...';
        
        // Start upload with timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout
        
        updateProgress(progressBar, progressPercent, 10);
        
        const response = await fetch('/api/upload-gtfs', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Simulate progress updates during processing
        const progressInterval = setInterval(() => {
            const currentProgress = parseFloat(progressBar.style.width) || 0;
            if (currentProgress < 85) {
                updateProgress(progressBar, progressPercent, Math.min(currentProgress + 2, 85));
            }
        }, 500);
        
        updateStepStatus(progressSteps, 'extract', 'complete');
        updateStepStatus(progressSteps, 'analyze', 'active');
        updateProgress(progressBar, progressPercent, 25);
        progressStatus.textContent = 'Analyzing GTFS files...';
        
        await new Promise(resolve => setTimeout(resolve, 500));
        updateStepStatus(progressSteps, 'analyze', 'complete');
        updateStepStatus(progressSteps, 'copy', 'active');
        updateProgress(progressBar, progressPercent, 50);
        progressStatus.textContent = 'Copying files...';
        
        await new Promise(resolve => setTimeout(resolve, 500));
        updateStepStatus(progressSteps, 'copy', 'complete');
        updateStepStatus(progressSteps, 'database', 'active');
        updateProgress(progressBar, progressPercent, 70);
        progressStatus.textContent = 'Storing in database...';
        
        const result = await response.json();
        
        clearInterval(progressInterval);
        
        if (!response.ok) {
            updateProgress(progressBar, progressPercent, 100);
            updateStepStatus(progressSteps, 'database', 'error');
            showUploadStatus(result.error || 'Upload failed', 'error');
            if (result.missing) {
                showUploadStatus(`Missing required files: ${result.missing.join(', ')}`, 'error');
            }
            resetUploadUI();
            return;
        }
        
        // Success
        updateStepStatus(progressSteps, 'database', 'complete');
        updateStepStatus(progressSteps, 'complete', 'complete');
        updateProgress(progressBar, progressPercent, 100);
        
        const elapsedTime = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
        progressStatus.textContent = `Upload completed successfully in ${elapsedTime}s`;
        
        showUploadStatus('GTFS file uploaded and processed successfully!', 'success');
        
        // Display analysis results
        displayAnalysisResults(result);
        
        // Hide progress after 2 seconds
        setTimeout(() => {
            progressContainer.style.display = 'none';
            resetUploadUI();
        }, 2000);
        
        // Refresh main dashboard data after a delay
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
            
            // Refresh archive page if it's currently visible
            const archivePage = document.getElementById('page-archive');
            if (archivePage && archivePage.classList.contains('active')) {
                if (typeof loadArchiveData === 'function') {
                    loadArchiveData();
                }
            }
        }, 1000);
        
    } catch (error) {
        console.error('Upload error:', error);
        const errorMessage = error.name === 'AbortError' 
            ? 'Upload timed out. The file may be too large.' 
            : 'Error uploading file: ' + error.message;
        showUploadStatus(errorMessage, 'error');
        resetUploadUI();
    }
}

// Update progress bar
function updateProgress(progressBar, progressPercent, percent) {
    progressBar.style.width = percent + '%';
    progressPercent.textContent = Math.round(percent) + '%';
}

// Update progress steps
function updateProgressSteps(container, steps) {
    container.innerHTML = steps.map((step, index) => {
        let indicatorContent = String(index + 1);
        if (step.status === 'pending') {
            indicatorContent = String(index + 1);
        } else if (step.status === 'active') {
            indicatorContent = '...';
        } else if (step.status === 'complete') {
            indicatorContent = 'OK';
        } else if (step.status === 'error') {
            indicatorContent = '!';
        }
        
        return `
        <div class="progress-step" data-step="${step.id}">
            <div class="step-indicator ${step.status}">${indicatorContent}</div>
            <div class="step-label">${step.label}</div>
        </div>
    `;
    }).join('');
}

// Update step status
function updateStepStatus(container, stepId, status) {
    const step = container.querySelector(`[data-step="${stepId}"]`);
    if (step) {
        const indicator = step.querySelector('.step-indicator');
        indicator.className = `step-indicator ${status}`;
        
        // Update indicator content
        let content = '';
        if (status === 'pending') {
            const stepIndex = Array.from(container.children).indexOf(step);
            content = String(stepIndex + 1);
        } else if (status === 'active') {
            content = '...';
        } else if (status === 'complete') {
            content = 'OK';
        } else if (status === 'error') {
            content = '!';
        }
        indicator.textContent = content;
    }
}

// Show upload status
function showUploadStatus(message, type) {
    const uploadStatus = document.getElementById('upload-status');
    uploadStatus.textContent = message;
    uploadStatus.className = `upload-status ${type}`;
    uploadStatus.style.display = 'block';
}

// Display analysis results
function displayAnalysisResults(result) {
    const resultsSection = document.getElementById('analysis-results');
    if (!resultsSection) return;
    
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    // Update KPI cards
    const stats = result.stats || {};
    const statsElements = {
        'upload-routes': stats.routes || '0',
        'upload-trips': stats.trips || '0',
        'upload-stops': stats.stops || '0',
        'upload-stop-times': stats.stop_times || '0',
        'upload-avg-duration': stats.avg_trip_duration_minutes || '-'
    };
    
    for (const [id, value] of Object.entries(statsElements)) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }
    
    // Display preview tables if available
    if (result.previews && Object.keys(result.previews).length > 0) {
        console.log('Calling displayPreviewTables with:', result.previews);
        displayPreviewTables(result.previews, result.columns || {});
    } else {
        console.warn('No preview data in result:', result);
    }
}

// Display preview tables
function displayPreviewTables(previews, columns) {
    console.log('Displaying preview tables:', previews);
    console.log('Columns:', columns);
    
    // Setup tab functionality
    setupPreviewTabs();
    
    // Display each table
    for (const [fileName, data] of Object.entries(previews)) {
        // Convert filename to table ID (e.g., routes.txt -> preview-routes)
        const tableId = `preview-${fileName.replace('.txt', '')}`;
        const table = document.getElementById(tableId);
        
        console.log(`Looking for table ID: ${tableId}`, table ? 'Found' : 'Not found');
        
        if (!table) {
            console.warn(`Table element not found: ${tableId}`);
            continue;
        }
        
        if (!data || data.length === 0) {
            console.warn(`No data for ${fileName}`);
            table.innerHTML = '<tbody><tr><td>No preview data available</td></tr></tbody>';
            continue;
        }
        
        // Get columns for this file
        const fileColumns = columns[fileName] || (data[0] ? Object.keys(data[0]) : []);
        
        if (!fileColumns || fileColumns.length === 0) {
            console.warn(`No columns found for ${fileName}`);
            table.innerHTML = '<tbody><tr><td>No columns available</td></tr></tbody>';
            continue;
        }
        
        // Create table header
        let html = '<thead><tr>';
        fileColumns.forEach(col => {
            html += `<th>${col}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        // Create table rows
        data.forEach(row => {
            html += '<tr>';
            fileColumns.forEach(col => {
                const value = row[col] || '';
                // Escape HTML in values
                const safeValue = String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                // Truncate long values
                const displayValue = safeValue.length > 50 ? safeValue.substring(0, 50) + '...' : safeValue;
                html += `<td title="${safeValue}">${displayValue}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</tbody>';
        table.innerHTML = html;
        console.log(`Displayed ${data.length} rows in table ${tableId}`);
    }
}

// Setup preview tabs
function setupPreviewTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Update active button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `tab-${targetTab}`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// Display stops on map
function displayStopsMap(stopsData) {
    // Remove existing map if any
    if (uploadMap) {
        uploadMap.remove();
    }
    
    const mapContainer = document.getElementById('upload-map');
    if (!mapContainer) return;
    
    if (!stopsData || stopsData.length === 0) {
        mapContainer.innerHTML = 
            '<div style="padding: 40px; text-align: center; color: #999;">No stops with coordinates available.</div>';
        return;
    }
    
    // Filter stops with valid coordinates
    const validStops = stopsData.filter(stop => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;
    });
    
    if (validStops.length === 0) {
        mapContainer.innerHTML = 
            '<div style="padding: 40px; text-align: center; color: #999;">No stops with valid coordinates found.</div>';
        return;
    }
    
    // Create map
    const firstStop = validStops[0];
    uploadMap = L.map('upload-map').setView([parseFloat(firstStop.stop_lat), parseFloat(firstStop.stop_lon)], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(uploadMap);
    
    // Add markers for stops
    const markers = [];
    validStops.forEach((stop, index) => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        const marker = L.marker([lat, lon], {
            icon: createUploadMarkerIcon('#7A003C', index + 1)
        }).addTo(uploadMap)
        .bindPopup(`
            <strong>${stop.stop_name || stop.stop_id}</strong><br>
            Stop ID: ${stop.stop_id}<br>
            ${stop.stop_desc ? `Description: ${stop.stop_desc}` : ''}
        `);
        
        markers.push(marker);
    });
    
    // Fit bounds to show all stops
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        uploadMap.fitBounds(group.getBounds().pad(0.1));
    }
    
    uploadedStops = validStops;
}

// Create upload marker icon
function createUploadMarkerIcon(color, number) {
    return L.divIcon({
        className: 'upload-marker',
        html: `
            <div style="
                background: ${color};
                width: 30px;
                height: 30px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 12px;
            ">${number}</div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

// Make functions available globally
window.initUploadPage = initUploadPage;
