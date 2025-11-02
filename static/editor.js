// Routes Map Editor JavaScript

let editorMap = null;
let editorRoutePolylines = [];
let editorStopMarkers = [];
let allEditorRoutes = [];
let allEditorStops = [];
let selectedEditorRoute = null;
let isEditMode = false;
let editedRoutePath = null;
let originalRoutePath = null;

// Initialize editor page
function initEditorPage() {
    initEditorMap();
    loadEditorData();
    setupEditorControls();
}

// Initialize map
function initEditorMap() {
    editorMap = L.map('editor-map', {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView([43.6532, -79.3832], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        detectRetina: true
    }).addTo(editorMap);
}

// Load routes and stops data
async function loadEditorData() {
    try {
        const [routesResponse, stopsResponse] = await Promise.all([
            fetch('/api/routes'),
            fetch('/api/stops')
        ]);
        
        allEditorRoutes = await routesResponse.json();
        allEditorStops = await stopsResponse.json();
        
        // Populate route selector
        populateRouteSelector();
        
        // Load route paths and display
        await loadEditorRoutePaths();
        displayEditorStops();
        
    } catch (error) {
        console.error('Error loading editor data:', error);
    }
}

// Load route paths
async function loadEditorRoutePaths() {
    try {
        const response = await fetch('/api/routes/paths');
        const allPaths = await response.json();
        
        // Clear existing polylines
        editorRoutePolylines.forEach(polyline => editorMap.removeLayer(polyline));
        editorRoutePolylines = [];
        
        allPaths.forEach(routePath => {
            const route = routePath.route;
            const coordinates = routePath.coordinates;
            
            if (!coordinates || coordinates.length < 2) return;
            
            const routeColor = route.route_color ? '#' + route.route_color : '#7A003C';
            const isSelected = selectedEditorRoute && selectedEditorRoute.route_id === route.route_id;
            
            // Create polyline with thicker line if selected
            const polyline = L.polyline(coordinates, {
                color: routeColor,
                weight: isSelected ? 6 : 3,
                opacity: isSelected ? 0.9 : 0.5,
                smoothFactor: 1
            }).addTo(editorMap);
            
            // Add click handler
            polyline.on('click', () => {
                selectEditorRoute(route.route_id);
            });
            
            // Add popup
            const routeName = route.route_short_name || route.route_id;
            polyline.bindPopup(`<strong>Route ${routeName}</strong><br>${route.route_long_name || ''}`);
            
            // Store reference
            polyline.routeId = route.route_id;
            polyline.route = route;
            editorRoutePolylines.push(polyline);
        });
        
    } catch (error) {
        console.error('Error loading route paths:', error);
    }
}

// Display stops on map
function displayEditorStops() {
    // Clear existing markers
    editorStopMarkers.forEach(marker => editorMap.removeLayer(marker));
    editorStopMarkers = [];
    
    allEditorStops.forEach(stop => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        if (isNaN(lat) || isNaN(lon)) return;
        
        const marker = L.marker([lat, lon], {
            icon: createEditorMarkerIcon('#7A003C')
        }).addTo(editorMap);
        
        marker.bindPopup(`<strong>${stop.stop_name || stop.stop_id}</strong><br>Stop ID: ${stop.stop_id}`);
        
        // Add click handler for edit mode
        marker.on('click', function() {
            if (isEditMode && selectedEditorRoute) {
                toggleStopOnRoute(stop);
            }
        });
        
        marker.stop = stop;
        stop.marker = marker; // Store marker reference on stop object
        editorStopMarkers.push(marker);
    });
}

// Create marker icon for editor
function createEditorMarkerIcon(color) {
    return L.divIcon({
        className: 'editor-marker',
        html: `
            <div style="
                background: ${color};
                width: 25px;
                height: 25px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 10px;
            ">📍</div>
        `,
        iconSize: [25, 25],
        iconAnchor: [12.5, 12.5]
    });
}

// Populate route selector
function populateRouteSelector() {
    const selector = document.getElementById('editor-route-select');
    if (!selector) return;
    
    // Clear existing options
    while (selector.options.length > 1) {
        selector.remove(1);
    }
    
    allEditorRoutes.forEach(route => {
        const option = document.createElement('option');
        option.value = route.route_id;
        const routeNum = route.route_short_name || route.route_id;
        const routeName = route.route_long_name || '';
        option.textContent = `${routeNum}${routeName ? ' - ' + routeName : ''}`;
        selector.appendChild(option);
    });
    
    // Add change handler
    selector.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        if (selectedValue && selectedValue !== '') {
            selectEditorRoute(selectedValue);
        } else {
            clearEditorSelection();
        }
    });
}

// Select a route for editing
async function selectEditorRoute(routeId) {
    if (!routeId || routeId === 'undefined' || routeId === '') {
        console.error('Invalid route ID:', routeId);
        return;
    }
    
    try {
        // Get route details
        const [detailsResponse, stopsResponse] = await Promise.all([
            fetch(`/api/routes/${routeId}/details`),
            fetch(`/api/routes/${routeId}/stops`)
        ]);
        
        if (!detailsResponse.ok) {
            throw new Error(`Failed to load route details: ${detailsResponse.status}`);
        }
        
        if (!stopsResponse.ok) {
            throw new Error(`Failed to load route stops: ${stopsResponse.status}`);
        }
        
        const details = await detailsResponse.json();
        const routeStops = await stopsResponse.json();
        
        if (!details.route) {
            throw new Error('Route data not found in response');
        }
        
        selectedEditorRoute = {
            ...details.route,
            stops: routeStops || [],
            trips: details.trips || [],
            total_stops: details.total_stops || 0,
            total_trips: details.total_trips || 0,
            avg_headway_minutes: details.avg_headway_minutes || null
        };
        
        // Update route selector to match
        const selector = document.getElementById('editor-route-select');
        if (selector && selector.value !== routeId) {
            selector.value = routeId;
        }
        
        // Update UI
        updateEditorUI();
        displayRouteDetails();
        
        // Highlight selected route on map
        highlightEditorRoute(routeId);
        
        // Fit map to route
        if (routeStops && routeStops.length > 0) {
            const validStops = routeStops.filter(s => {
                const lat = parseFloat(s.stop_lat);
                const lon = parseFloat(s.stop_lon);
                return !isNaN(lat) && !isNaN(lon);
            });
            
            if (validStops.length > 0) {
                const bounds = L.latLngBounds(validStops.map(s => [parseFloat(s.stop_lat), parseFloat(s.stop_lon)]));
                editorMap.fitBounds(bounds.pad(0.1));
            }
        }
        
    } catch (error) {
        console.error('Error selecting route:', error);
        showSaveNotification('Error loading route details: ' + error.message, 'error');
        
        // Clear selection on error
        clearEditorSelection();
    }
}

// Highlight selected route
function highlightEditorRoute(routeId) {
    if (!routeId) return;
    
    editorRoutePolylines.forEach(polyline => {
        if (!polyline.route || !polyline.routeId) return;
        
        const isSelected = polyline.routeId === routeId;
        const routeColor = polyline.route.route_color ? '#' + polyline.route.route_color : '#7A003C';
        
        polyline.setStyle({
            weight: isSelected ? 6 : 3,
            opacity: isSelected ? 0.9 : 0.5,
            color: routeColor
        });
    });
}

// Clear selection
function clearEditorSelection() {
    selectedEditorRoute = null;
    isEditMode = false;
    originalRoutePath = null;
    editedRoutePath = null;
    
    const selector = document.getElementById('editor-route-select');
    if (selector) {
        selector.value = '';
    }
    
    const panelContent = document.getElementById('editor-panel-content');
    if (panelContent) {
        panelContent.innerHTML = '<p class="placeholder">Select a route to view and edit details</p>';
    }
    
    const kpisSection = document.getElementById('editor-kpis');
    if (kpisSection) {
        kpisSection.style.display = 'none';
    }
    
    updateEditorUI();
    highlightEditorRoute(null);
    
    // Reset all markers to default color
    editorStopMarkers.forEach(marker => {
        if (marker.stop) {
            marker.setIcon(createEditorMarkerIcon('#7A003C'));
        }
    });
}

// Update editor UI based on selection
function updateEditorUI() {
    const editBtn = document.getElementById('edit-mode-btn');
    const saveBtn = document.getElementById('save-route-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const kpisSection = document.getElementById('editor-kpis');
    
    if (selectedEditorRoute) {
        kpisSection.style.display = 'block';
        
        // Update KPI values
        document.getElementById('editor-route-name').textContent = selectedEditorRoute.route_short_name || selectedEditorRoute.route_id;
        document.getElementById('editor-stop-count').textContent = selectedEditorRoute.total_stops || '-';
        document.getElementById('editor-trip-count').textContent = selectedEditorRoute.total_trips || '-';
        
        // Calculate route distance
        calculateRouteDistance(selectedEditorRoute.stops);
        
        // Enable buttons
        editBtn.disabled = false;
        
        if (isEditMode) {
            editBtn.textContent = 'Stop Editing';
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
        } else {
            editBtn.textContent = 'Edit Mode';
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
        }
    } else {
        kpisSection.style.display = 'none';
        editBtn.disabled = true;
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
    }
}

// Calculate route distance
function calculateRouteDistance(stops) {
    if (!stops || stops.length < 2) {
        document.getElementById('editor-distance').textContent = '-';
        return;
    }
    
    let totalDistance = 0;
    for (let i = 0; i < stops.length - 1; i++) {
        const lat1 = parseFloat(stops[i].stop_lat);
        const lon1 = parseFloat(stops[i].stop_lon);
        const lat2 = parseFloat(stops[i + 1].stop_lat);
        const lon2 = parseFloat(stops[i + 1].stop_lon);
        
        if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
            const distance = haversineDistance(lat1, lon1, lat2, lon2);
            totalDistance += distance;
        }
    }
    
    document.getElementById('editor-distance').textContent = totalDistance.toFixed(2);
}

// Haversine distance formula
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Display route details form
function displayRouteDetails() {
    if (!selectedEditorRoute) return;
    
    const panelContent = document.getElementById('editor-panel-content');
    const route = selectedEditorRoute;
    
    const routeColor = route.route_color ? '#' + route.route_color : '#7A003C';
    
    let html = `
        <div class="route-details-form">
            <div class="form-group">
                <label>Route ID:</label>
                <input type="text" id="edit-route-id" value="${route.route_id}" readonly class="form-input readonly">
            </div>
            <div class="form-group">
                <label>Route Short Name:</label>
                <input type="text" id="edit-route-short-name" value="${route.route_short_name || ''}" 
                       ${isEditMode ? '' : 'readonly'} class="form-input ${isEditMode ? '' : 'readonly'}">
            </div>
            <div class="form-group">
                <label>Route Long Name:</label>
                <input type="text" id="edit-route-long-name" value="${route.route_long_name || ''}" 
                       ${isEditMode ? '' : 'readonly'} class="form-input ${isEditMode ? '' : 'readonly'}">
            </div>
            <div class="form-group">
                <label>Route Color:</label>
                <div class="color-input-group">
                    <input type="color" id="edit-route-color" value="${routeColor}" 
                           ${isEditMode ? '' : 'disabled'} class="color-picker">
                    <input type="text" id="edit-route-color-text" value="${routeColor}" 
                           ${isEditMode ? '' : 'readonly'} class="form-input color-text ${isEditMode ? '' : 'readonly'}">
                </div>
            </div>
            ${route.route_desc ? `
            <div class="form-group">
                <label>Route Description:</label>
                <textarea id="edit-route-desc" ${isEditMode ? '' : 'readonly'} 
                          class="form-textarea ${isEditMode ? '' : 'readonly'}">${route.route_desc}</textarea>
            </div>
            ` : ''}
        </div>
    `;
    
    // Add stops list if editing
    if (isEditMode && route.stops) {
        html += `
            <div class="stops-list-section">
                <h4>Stops on Route (Click stops on map to add/remove)</h4>
                <div class="stops-list" id="editor-stops-list">
        `;
        
        route.stops.forEach((stop, index) => {
            html += `
                <div class="stop-list-item" data-stop-id="${stop.stop_id}">
                    <span class="stop-sequence">${index + 1}</span>
                    <span class="stop-name">${stop.stop_name || stop.stop_id}</span>
                    <button class="remove-stop-btn" onclick="removeStopFromRoute('${stop.stop_id}')">×</button>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    panelContent.innerHTML = html;
    
    // Sync color picker and text input
    const colorPicker = document.getElementById('edit-route-color');
    const colorText = document.getElementById('edit-route-color-text');
    
    if (colorPicker && colorText) {
        colorPicker.addEventListener('input', (e) => {
            colorText.value = e.target.value;
            if (selectedEditorRoute) {
                updateRouteColorPreview(e.target.value);
            }
        });
        
        colorText.addEventListener('change', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                colorPicker.value = e.target.value;
                if (selectedEditorRoute) {
                    updateRouteColorPreview(e.target.value);
                }
            }
        });
    }
}

// Update route color preview on map
function updateRouteColorPreview(color) {
    if (!selectedEditorRoute) return;
    
    editorRoutePolylines.forEach(polyline => {
        if (polyline.routeId === selectedEditorRoute.route_id) {
            polyline.setStyle({ color: color });
        }
    });
}

// Toggle stop on route
function toggleStopOnRoute(stop) {
    if (!selectedEditorRoute || !isEditMode) return;
    
    const stopIndex = selectedEditorRoute.stops.findIndex(s => s.stop_id === stop.stop_id);
    
    if (stopIndex >= 0) {
        // Remove stop
        selectedEditorRoute.stops.splice(stopIndex, 1);
        stop.marker.setIcon(createEditorMarkerIcon('#7A003C'));
    } else {
        // Add stop at end
        selectedEditorRoute.stops.push(stop);
        stop.marker.setIcon(createEditorMarkerIcon('#FDBF57'));
    }
    
    // Update display
    displayRouteDetails();
    updateRoutePath();
    updateEditorUI();
}

// Remove stop from route
window.removeStopFromRoute = function(stopId) {
    if (!selectedEditorRoute || !isEditMode) return;
    
    const stopIndex = selectedEditorRoute.stops.findIndex(s => s.stop_id === stopId);
    if (stopIndex >= 0) {
        selectedEditorRoute.stops.splice(stopIndex, 1);
        
        // Reset marker color
        const marker = editorStopMarkers.find(m => m.stop.stop_id === stopId);
        if (marker) {
            marker.setIcon(createEditorMarkerIcon('#7A003C'));
        }
        
        displayRouteDetails();
        updateRoutePath();
        updateEditorUI();
    }
};

// Update route path on map
function updateRoutePath() {
    if (!selectedEditorRoute || !isEditMode) return;
    
    // Remove old polyline
    editorRoutePolylines.forEach(polyline => {
        if (polyline.routeId === selectedEditorRoute.route_id) {
            editorMap.removeLayer(polyline);
        }
    });
    editorRoutePolylines = editorRoutePolylines.filter(p => p.routeId !== selectedEditorRoute.route_id);
    
    // Create new path from current stops
    const coordinates = selectedEditorRoute.stops
        .filter(s => {
            const lat = parseFloat(s.stop_lat);
            const lon = parseFloat(s.stop_lon);
            return !isNaN(lat) && !isNaN(lon);
        })
        .map(s => [parseFloat(s.stop_lat), parseFloat(s.stop_lon)]);
    
    if (coordinates.length >= 2) {
        const routeColor = document.getElementById('edit-route-color')?.value || '#7A003C';
        
        const newPolyline = L.polyline(coordinates, {
            color: routeColor,
            weight: 6,
            opacity: 0.9,
            smoothFactor: 1
        }).addTo(editorMap);
        
        newPolyline.routeId = selectedEditorRoute.route_id;
        newPolyline.route = selectedEditorRoute;
        editorRoutePolylines.push(newPolyline);
        
        // Fit to bounds
        const bounds = L.latLngBounds(coordinates);
        editorMap.fitBounds(bounds.pad(0.1));
    }
}

// Setup editor controls
function setupEditorControls() {
    // Edit mode button
    const editBtn = document.getElementById('edit-mode-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (!selectedEditorRoute) return;
            
            isEditMode = !isEditMode;
            
            if (isEditMode) {
                originalRoutePath = JSON.parse(JSON.stringify(selectedEditorRoute.stops));
                editBtn.textContent = 'Stop Editing';
            } else {
                editBtn.textContent = 'Edit Mode';
            }
            
            updateEditorUI();
            displayRouteDetails();
        });
    }
    
    // Save button
    const saveBtn = document.getElementById('save-route-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveRouteEdits);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (originalRoutePath) {
                selectedEditorRoute.stops = JSON.parse(JSON.stringify(originalRoutePath));
                originalRoutePath = null;
            }
            isEditMode = false;
            updateEditorUI();
            displayRouteDetails();
            loadEditorRoutePaths();
        });
    }
    
    // Toggle stops button
    const toggleStopsBtn = document.getElementById('toggle-stops-btn');
    if (toggleStopsBtn) {
        toggleStopsBtn.addEventListener('click', () => {
            const isVisible = editorStopMarkers[0] && editorMap.hasLayer(editorStopMarkers[0]);
            
            editorStopMarkers.forEach(marker => {
                if (isVisible) {
                    editorMap.removeLayer(marker);
                } else {
                    marker.addTo(editorMap);
                }
            });
            
            toggleStopsBtn.classList.toggle('active');
        });
    }
    
    // Toggle routes button
    const toggleRoutesBtn = document.getElementById('toggle-routes-btn');
    if (toggleRoutesBtn) {
        toggleRoutesBtn.addEventListener('click', () => {
            const isVisible = editorRoutePolylines[0] && editorMap.hasLayer(editorRoutePolylines[0]);
            
            editorRoutePolylines.forEach(polyline => {
                if (isVisible) {
                    editorMap.removeLayer(polyline);
                } else {
                    polyline.addTo(editorMap);
                }
            });
            
            toggleRoutesBtn.classList.toggle('active');
        });
    }
}

// Save route edits
async function saveRouteEdits() {
    if (!selectedEditorRoute || !isEditMode) return;
    
    const saveBtn = document.getElementById('save-route-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        // Collect form data
        const routeId = document.getElementById('edit-route-id').value;
        const routeShortName = document.getElementById('edit-route-short-name').value;
        const routeLongName = document.getElementById('edit-route-long-name').value;
        const routeColor = document.getElementById('edit-route-color').value;
        const routeDesc = document.getElementById('edit-route-desc')?.value || '';
        
        // Remove # from color if present
        const colorHex = routeColor.replace('#', '').toUpperCase();
        
        // Prepare update data
        const updateData = {
            route_id: routeId,
            route_short_name: routeShortName,
            route_long_name: routeLongName,
            route_color: colorHex,
            route_desc: routeDesc,
            stops: selectedEditorRoute.stops.map((s, index) => ({
                stop_id: s.stop_id,
                stop_sequence: index + 1
            }))
        };
        
        // Save to backend
        const response = await fetch(`/api/routes/${routeId}/update`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to save route');
        }
        
        // Success
        showSaveNotification('Route saved successfully!');
        
        // Exit edit mode
        isEditMode = false;
        originalRoutePath = null;
        updateEditorUI();
        displayRouteDetails();
        
        // Reload routes
        await loadEditorRoutePaths();
        await loadEditorData();
        
        // Refresh main dashboard if needed
        if (typeof loadKPIs === 'function') {
            loadKPIs();
        }
        if (typeof loadRoutes === 'function') {
            loadRoutes();
        }
        
    } catch (error) {
        console.error('Error saving route:', error);
        showSaveNotification('Error saving route: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
}

// Show save notification
function showSaveNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `save-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Make function global
window.initEditorPage = initEditorPage;

