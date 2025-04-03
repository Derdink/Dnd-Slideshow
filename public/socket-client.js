// socket-client-2.js
// Refactored Socket.IO client logic based on Prompt 4

/**
 * @file Manages the client-side Socket.IO connection and event handling.
 */

(function() {
    'use strict';

    /**
     * Configuration options for the Socket.IO connection.
     * @type {object}
     */
    const socketOptions = {
        transports: ['polling', 'websocket'], // Prioritize websocket but allow polling fallback
        upgrade: true,
        rememberUpgrade: true,
        reconnection: true, // Enable auto-reconnection
        reconnectionAttempts: 5, // Limit reconnection attempts
        reconnectionDelay: 1000, // Initial delay
        reconnectionDelayMax: 5000, // Max delay between attempts
        timeout: 20000, // Connection timeout
        autoConnect: true, // Connect automatically on load
        // forceNew: true, // Generally avoid unless necessary for specific testing scenarios
        path: '/socket.io/',
        // Add query parameters if needed for authentication or identification
        // query: { token: 'your_auth_token' }
    };

    /**
     * The Socket.IO client instance.
     * Initialized using the server URL and configured options.
     * @type {Socket} - Socket.IO Client instance
     */
    const socket = io('http://localhost:3000', socketOptions); // Use the correct server URL

    // --- Connection State Handling ---

    /**
     * Handles the successful connection event.
     */
    socket.on('connect', () => {
        console.log(`🔌 Socket connected successfully (ID: ${socket.id}, Transport: ${socket.io.engine.transport.name})`);
        // Optional: Notify UI of connection success
        // if (typeof window.updateConnectionStatus === 'function') {
        //     window.updateConnectionStatus(true);
        // }
    });

    /**
     * Handles the disconnection event.
     * @param {string} reason - The reason for disconnection.
     */
    socket.on('disconnect', (reason) => {
        console.warn(`🔌 Socket disconnected: ${reason}`);
        // Optional: Notify UI of disconnection
        // if (typeof window.updateConnectionStatus === 'function') {
        //     window.updateConnectionStatus(false, reason);
        // }
        // The default reconnection logic handles reconnect attempts unless reason is 'io server disconnect'
        if (reason === 'io server disconnect') {
            // Server explicitly disconnected, may not want to auto-reconnect immediately
            console.log('Server initiated disconnect.');
            // socket.connect(); // Manually reconnect if needed based on app logic
        } else if (reason === 'io client disconnect') {
            console.log('Client initiated disconnect.');
        } else {
            console.log('Attempting to reconnect...');
        }
    });

    // --- Reconnection Handling ---

    /**
     * Handles reconnection attempts.
     * @param {number} attemptNumber - The current reconnection attempt number.
     */
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`⏳ Socket attempting to reconnect... (Attempt ${attemptNumber})`);
    });

    /**
     * Handles successful reconnection.
     * @param {number} attemptNumber - The number of attempts it took to reconnect.
     */
    socket.on('reconnect', (attemptNumber) => {
        console.log(`✅ Socket reconnected successfully after ${attemptNumber} attempts (ID: ${socket.id})`);
        // Optional: Notify UI of reconnection
        // if (typeof window.updateConnectionStatus === 'function') {
        //     window.updateConnectionStatus(true);
        // }
    });

    /**
     * Handles failure to reconnect after all attempts.
     * @param {Error} error - The error object related to the reconnection failure.
     */
    socket.on('reconnect_failed', (error) => {
        console.error('❌ Socket reconnection failed after all attempts.', error);
        // Optional: Notify UI of permanent failure
        // if (typeof window.updateConnectionStatus === 'function') {
        //     window.updateConnectionStatus(false, 'Reconnection failed');
        // }
    });

    // --- Error Handling ---

    /**
     * Handles general connection errors.
     * @param {Error} error - The connection error object.
     */
    socket.on('connect_error', (error) => {
        console.error(`❌ Socket connection error: ${error.message}`, error);
        // Optional: Display error to the user or attempt specific recovery
    });

    /**
     * Handles generic socket errors.
     * @param {Error} error - The error object.
     */
    socket.on('error', (error) => {
        console.error('❌ General socket error:', error);
    });

    // --- Server-Sent Event Handlers (Placeholders/Wrappers) ---
    // These listeners receive events from the server.
    // The actual logic to handle these events (e.g., update UI)
    // should be called from within these handlers, possibly by invoking
    // functions defined in main.js or specific page scripts.

    /**
     * Listener for server-sent settings updates.
     * Calls the appropriate handler if available.
     * @param {object} data - Data containing new settings (e.g., { speed, order }).
     */
    // REMOVED Redundant Listener - Handled by specific modules (slideshow.js, settings.js)
    /*
    socket.on('settingsUpdate', (data) => {
        console.log("⚙️ Received 'settingsUpdate':", data);
        // Call the actual handler function (example)
        if (typeof window.handleSettingsUpdate === 'function') {
            window.handleSettingsUpdate(data);
        } else {
            console.warn("No handler found for 'settingsUpdate'");
        }
    });
    */

    /**
     * Handles request to play a specific image.
     * @param {object} data - Data containing image details (e.g., { imageUrl, title, description }).
     */
    socket.on('playImage', (data) => {
        console.log("▶️ Received 'playImage':", data);
        // Call the actual handler function (example)
        if (typeof window.handlePlayImage === 'function') {
            window.handlePlayImage(data);
        } else {
            console.warn("No handler found for 'playImage'");
        }
    });

    /**
     * Handles request to play a selection of images.
     * @param {object} data - Data containing image list and settings (e.g., { images, speed, order }).
     */
    socket.on('playSelect', (data) => {
        console.log("⏯️ Received 'playSelect':", { imagesCount: data?.images?.length, speed: data?.speed, order: data?.order });
        // Call the actual handler function (example)
        if (typeof window.handlePlaySelect === 'function') {
            window.handlePlaySelect(data);
        } else {
            console.warn("No handler found for 'playSelect'");
        }
    });

    /**
     * Handles slideshow navigation actions (next/prev).
     * @param {object} data - Data containing the action (e.g., { action: 'next' }).
     */
    socket.on('slideAction', (data) => {
        console.log("⏭️ Received 'slideAction':", data);
        // Call the actual handler function (example)
        if (typeof window.handleSlideAction === 'function') {
            window.handleSlideAction(data);
        } else {
            console.warn("No handler found for 'slideAction'");
        }
    });

    // --- Expose socket instance globally (if needed) ---
    // This makes it accessible from other scripts like main.js
    // Consider using modules or event emitters for more complex applications.
    window.socket = socket;

    console.log('Client Socket Initialized (socket-client-2.js)');

})(); // End of IIFE