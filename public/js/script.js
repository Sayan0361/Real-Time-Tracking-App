// ====== Constants and Configuration ======
// ====== Constants and Configuration ======
const CONFIG = {
    defaultView: [51.505, -0.09],
    defaultZoom: 15,
    // Change this line to use the light theme instead
    mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    mapAttribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>',
    buildingCoordinates: [
      [51.509, -0.08],
      [51.509, -0.07],
      [51.51, -0.07],
      [51.51, -0.08]
    ],
    buildingHeight: 200,
    geolocation: {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    },
    userColors: [
      '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33F0',
      '#FFBD33', '#33FFBD', '#BD33FF', '#FF3333', '#33FF33'
    ]
  };
  
  // ====== Initialize Socket & Map ======
  const socket = io();
  const map = L.map('map').setView(CONFIG.defaultView, CONFIG.defaultZoom);
  const markers = {}; // Track all user markers
  const userPaths = {}; // Track user movement paths
  let followMode = true; // Auto-center on your location
  let colorIndex = 0; // For assigning colors to users
  
  // Custom marker icons
  const createUserIcon = (color = '#3388ff', isCurrentUser = false) => {
    return L.divIcon({
      className: 'custom-user-marker',
      html: `<div style="
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        width: ${isCurrentUser ? '18px' : '14px'};
        height: ${isCurrentUser ? '18px' : '14px'};
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  };
  
  // Initialize map tiles
  L.tileLayer(CONFIG.mapTileUrl, {
    attribution: CONFIG.mapAttribution
  }).addTo(map);
  
  // Add building with 3D effect
  const building = L.polygon(CONFIG.buildingCoordinates, { 
    color: '#4a83ec',
    fillColor: '#4a83ec',
    fillOpacity: 0.5,
    weight: 2,
    pseudo3d: true,
    height: CONFIG.buildingHeight
  }).addTo(map);
  
  // Add UI controls
  const addMapControls = () => {
    // Custom control for toggling follow mode
    const followControl = L.control({ position: 'bottomright' });
    followControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'follow-control');
      div.innerHTML = '<button id="toggle-follow" class="control-button">Follow Me: ON</button>';
      return div;
    };
    followControl.addTo(map);
    
    // Custom control for showing user list
    const userListControl = L.control({ position: 'topright' });
    userListControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'user-list-control');
      div.innerHTML = '<div id="user-list" class="user-list-panel"><h3>Online Users</h3><ul id="online-users"></ul></div>';
      return div;
    };
    userListControl.addTo(map);
    
    // Event listeners for controls
    document.getElementById('toggle-follow').addEventListener('click', function() {
      followMode = !followMode;
      this.textContent = `Follow Me: ${followMode ? 'ON' : 'OFF'}`;
    });
    
    // Add map click handler to disable follow mode
    map.on('drag', function() {
      if (followMode) {
        followMode = false;
        document.getElementById('toggle-follow').textContent = 'Follow Me: OFF';
      }
    });
  };
  
  // ====== Geolocation Handling ======
  const initGeolocation = () => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        handleGeolocationError,
        CONFIG.geolocation
      );
      
      // One-time accurate position to set initial view
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          map.setView([latitude, longitude], CONFIG.defaultZoom);
        },
        null,
        { enableHighAccuracy: true }
      );
      
      return watchId;
    } else {
      showNotification("Geolocation is not supported by this browser", "error");
      return null;
    }
  };
  
  const handlePositionUpdate = (position) => {
    const { latitude, longitude, accuracy, heading, speed } = position.coords;
    const timestamp = position.timestamp;
    
    // Send to server with additional data
    socket.emit("send-location", { 
      latitude, 
      longitude,
      accuracy,
      heading: heading || null,
      speed: speed || null,
      timestamp
    });
    
    updateUserPosition('me', latitude, longitude, '#00b0ff', true);
    
    // Update path line
    if (!userPaths['me']) {
      userPaths['me'] = L.polyline([[latitude, longitude]], {
        color: '#00b0ff',
        weight: 3,
        opacity: 0.6,
        lineJoin: 'round'
      }).addTo(map);
    } else {
      const currentPath = userPaths['me'].getLatLngs();
      currentPath.push([latitude, longitude]);
      
      // Limit the path length to prevent performance issues
      if (currentPath.length > 100) {
        currentPath.shift();
      }
      
      userPaths['me'].setLatLngs(currentPath);
    }
    
    // Center map on user if follow mode is enabled
    if (followMode) {
      map.setView([latitude, longitude]);
    }
  
    // Update accuracy circle
    if (!markers['me_accuracy']) {
      markers['me_accuracy'] = L.circle([latitude, longitude], {
        radius: accuracy,
        color: '#00b0ff',
        fillColor: '#00b0ff',
        fillOpacity: 0.1,
        weight: 1
      }).addTo(map);
    } else {
      markers['me_accuracy'].setLatLng([latitude, longitude]);
      markers['me_accuracy'].setRadius(accuracy);
    }
  };
  
  const handleGeolocationError = (error) => {
    const errorMessages = {
      1: "Location access denied. Please enable location services.",
      2: "Location unavailable. Try again later.",
      3: "Location request timed out."
    };
    
    showNotification(errorMessages[error.code] || "Unknown geolocation error", "error");
    console.error("Geolocation error:", error);
  };
  
  // ====== User Management Functions ======
  const updateUserPosition = (id, latitude, longitude, color, isCurrentUser = false) => {
    const position = [latitude, longitude];
    const userId = isCurrentUser ? 'me' : id;
    const userColor = color || getNextColor();
    
    if (!markers[userId]) {
      // Create new marker
      markers[userId] = L.marker(position, {
        icon: createUserIcon(userColor, isCurrentUser)
      }).addTo(map);
      
      // Add popup with user info
      const popupContent = isCurrentUser ? 
        '<div class="user-popup"><b>You</b><br>Current position</div>' : 
        `<div class="user-popup"><b>User ${userId.substring(0, 5)}</b></div>`;
      
      markers[userId].bindPopup(popupContent);
      
      // Update user list
      updateUserListUI();
    } else {
      // Update existing marker
      markers[userId].setLatLng(position);
    }
  };
  
  const removeUser = (id) => {
    if (markers[id]) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
    
    if (userPaths[id]) {
      map.removeLayer(userPaths[id]);
      delete userPaths[id];
    }
    
    updateUserListUI();
    showNotification(`User ${id.substring(0, 5)} disconnected`, "info");
  };
  
  const updateUserListUI = () => {
    const userList = document.getElementById('online-users');
    if (!userList) return;
    
    userList.innerHTML = '';
    
    // Add current user first
    if (markers['me']) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="user-dot" style="background-color:#00b0ff"></span> You';
      userList.appendChild(li);
    }
    
    // Add other users
    Object.keys(markers).forEach(id => {
      if (id !== 'me' && id !== 'me_accuracy') {
        const li = document.createElement('li');
        const color = markers[id].options.icon.options.html.match(/background-color: ([^;]+)/)[1];
        li.innerHTML = `<span class="user-dot" style="background-color:${color}"></span> User ${id.substring(0, 5)}`;
        userList.appendChild(li);
      }
    });
  };
  
  // ====== Socket Event Handlers ======
  const setupSocketHandlers = () => {
    // Handle connection status
    socket.on('connect', () => {
      showNotification('Connected to server', 'success');
    });
    
    socket.on('disconnect', () => {
      showNotification('Disconnected from server', 'error');
    });
  
    // Handle other users' locations
    socket.on("update-location", (data) => {
      const { id, latitude, longitude, accuracy } = data;
      
      // Skip if it's our own data
      if (id === socket.id) return;
      
      const userColor = getColorForUser(id);
      updateUserPosition(id, latitude, longitude, userColor);
      
      // Update or create path for this user
      if (!userPaths[id]) {
        userPaths[id] = L.polyline([[latitude, longitude]], {
          color: userColor,
          weight: 2,
          opacity: 0.5,
          dashArray: '5, 5'
        }).addTo(map);
      } else {
        const currentPath = userPaths[id].getLatLngs();
        currentPath.push([latitude, longitude]);
        
        // Limit path length
        if (currentPath.length > 50) {
          currentPath.shift();
        }
        
        userPaths[id].setLatLngs(currentPath);
      }
      
      // Add accuracy circle if provided
      if (accuracy && !isNaN(accuracy)) {
        if (!markers[`${id}_accuracy`]) {
          markers[`${id}_accuracy`] = L.circle([latitude, longitude], {
            radius: accuracy,
            color: userColor,
            fillColor: userColor,
            fillOpacity: 0.05,
            weight: 1
          }).addTo(map);
        } else {
          markers[`${id}_accuracy`].setLatLng([latitude, longitude]);
          markers[`${id}_accuracy`].setRadius(accuracy);
        }
      }
    });
  
    // Handle user disconnections
    socket.on("user-disconnected", (id) => {
      removeUser(id);
    });
    
    // Handle users list
    socket.on("users-list", (users) => {
      updateUserListUI();
    });
  };
  
  // ====== Utility Functions ======
  const getNextColor = () => {
    const color = CONFIG.userColors[colorIndex];
    colorIndex = (colorIndex + 1) % CONFIG.userColors.length;
    return color;
  };
  
  const getColorForUser = (id) => {
    // Generate a consistent color based on user ID
    const hash = Array.from(id).reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const index = Math.abs(hash) % CONFIG.userColors.length;
    return CONFIG.userColors[index];
  };
  
  const showNotification = (message, type = 'info') => {
    // Create notification if doesn't exist
    if (!document.getElementById('notifications')) {
      const notifContainer = document.createElement('div');
      notifContainer.id = 'notifications';
      notifContainer.className = 'notification-container';
      document.body.appendChild(notifContainer);
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.getElementById('notifications').appendChild(notification);
    
    // Remove after delay
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => {
        notification.remove();
      }, 500);
    }, 3000);
  };
  const addManualLocationControl = () => {
    // Create the control
    const manualLocationControl = L.control({ position: 'topleft' });
    
    manualLocationControl.onAdd = function() {
      const container = L.DomUtil.create('div', 'manual-location-control');
      
      container.innerHTML = `
        <div class="manual-location-panel">
          <button id="manual-location-btn" class="control-button">Set Location</button>
          <div id="location-form" style="display: none; margin-top: 10px;">
            <input type="text" id="lat-input" placeholder="Latitude (e.g. 51.505)" />
            <input type="text" id="lng-input" placeholder="Longitude (e.g. -0.09)" />
            <button id="set-location-btn" class="control-button">Go</button>
            
            <div style="margin-top: 10px;">
              <button id="current-location-btn" class="control-button current-location-btn">
                <span class="location-icon">📍</span> Use My Current Location
              </button>
            </div>
            
            <div style="margin-top: 10px;">
              <select id="preset-locations">
                <option value="">-- Common Places --</option>
                <option value="51.5074,-0.1278">London</option>
                <option value="40.7128,-74.0060">New York</option>
                <option value="48.8566,2.3522">Paris</option>
                <option value="35.6762,139.6503">Tokyo</option>
                <option value="37.7749,-122.4194">San Francisco</option>
              </select>
            </div>
          </div>
        </div>
      `;
      
      // Prevent map interactions when using the form
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      
      return container;
    };
    
    manualLocationControl.addTo(map);
    
    // Add event listeners after the control is added to the map
    setTimeout(() => {
      // Toggle form visibility
      document.getElementById('manual-location-btn').addEventListener('click', function() {
        const form = document.getElementById('location-form');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
      
      // Handle preset selection
      document.getElementById('preset-locations').addEventListener('change', function() {
        if (this.value) {
          const [lat, lng] = this.value.split(',');
          document.getElementById('lat-input').value = lat;
          document.getElementById('lng-input').value = lng;
        }
      });
      
      // Handle current location button
      document.getElementById('current-location-btn').addEventListener('click', function() {
        if (navigator.geolocation) {
          showNotification('Getting your current location...', 'info');
          
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              
              // Update input fields
              document.getElementById('lat-input').value = latitude.toFixed(6);
              document.getElementById('lng-input').value = longitude.toFixed(6);
              
              // Update map view
              map.setView([latitude, longitude], 15);
              
              // Update position marker
              updateUserPosition('me', latitude, longitude, '#00b0ff', true);
              
              showNotification('Current location set', 'success');
              
              // Enable follow mode
              followMode = true;
              document.getElementById('toggle-follow').textContent = 'Follow Me: ON';
            },
            (error) => {
              const errorMessages = {
                1: "Location access denied. Please enable location services.",
                2: "Location unavailable. Try again later.",
                3: "Location request timed out."
              };
              
              showNotification(errorMessages[error.code] || "Error getting location", "error");
            },
            { enableHighAccuracy: true }
          );
        } else {
          showNotification("Geolocation is not supported by this browser", "error");
        }
      });
      
      // Handle location setting
      document.getElementById('set-location-btn').addEventListener('click', function() {
        const lat = parseFloat(document.getElementById('lat-input').value);
        const lng = parseFloat(document.getElementById('lng-input').value);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          // Update map view
          map.setView([lat, lng], 15);
          
          // Optionally, update your position marker
          updateUserPosition('me', lat, lng, '#00b0ff', true);
          
          // Disable follow mode since we're manually setting location
          followMode = false;
          document.getElementById('toggle-follow').textContent = 'Follow Me: OFF';
          
          showNotification('Location set manually', 'info');
        } else {
          showNotification('Please enter valid coordinates', 'error');
        }
      });
    }, 100);
  };
  
  const addManualLocationStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
      .manual-location-panel {
        background: white;
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        min-width: 220px;
      }
      .manual-location-panel input {
        width: 100%;
        margin-bottom: 5px;
        padding: 5px;
        box-sizing: border-box;
      }
      .manual-location-panel select {
        width: 100%;
        padding: 5px;
      }
      .current-location-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #2196F3;
        color: white;
        transition: background-color 0.3s;
      }
      .current-location-btn:hover {
        background-color: #0b7dda;
      }
      .location-icon {
        margin-right: 5px;
        font-size: 16px;
      }
    `;
    document.head.appendChild(style);
  };

  // ====== Initialization ======
  const initApp = () => {
    // Add CSS styles
    const styleElement = document.createElement('style');
    // addManualLocationStyles();
    // addManualLocationControl();
    styleElement.textContent = `
      .custom-user-marker {
        background: transparent;
        border: none;
      }
      .notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        max-width: 300px;
      }
      .notification {
        margin-bottom: 10px;
        padding: 10px 15px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        animation: slide-in 0.3s ease-out;
      }
      .notification.success { background-color: #4CAF50; }
      .notification.error { background-color: #F44336; }
      .notification.info { background-color: #2196F3; }
      .notification.fade-out {
        opacity: 0;
        transition: opacity 0.5s;
      }
      .control-button {
        padding: 8px 12px;
        background: rgba(255,255,255,0.8);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      }
      .control-button:hover {
        background: rgba(255,255,255,0.9);
      }
      .user-list-panel {
        background: rgba(255,255,255,0.8);
        border-radius: 4px;
        padding: 10px;
        min-width: 150px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      }
      .user-list-panel h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
      }
      .user-list-panel ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .user-list-panel li {
        margin-bottom: 5px;
        display: flex;
        align-items: center;
      }
      .user-dot {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 5px;
      }
      .user-popup {
        text-align: center;
      }
      @keyframes slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(styleElement);
    
    // Initialize UI controls
    addMapControls();
    
    // Setup socket event handlers
    setupSocketHandlers();
    
    // Start geolocation tracking
    const watchId = initGeolocation();
    
    // Add event listener for window close to clean up
    window.addEventListener('beforeunload', () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    });
  };
  
  // Start the application
  document.addEventListener('DOMContentLoaded', initApp);