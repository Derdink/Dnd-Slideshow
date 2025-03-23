// Initialize socket with robust configuration
window.socket = io('http://localhost:3000', {
    transports: ['polling', 'websocket'],
    upgrade: true,
    rememberUpgrade: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
    forceNew: true,
    path: '/socket.io/',
    query: {}
});

// Add detailed connection state logging
socket.on('connect', () => {
    console.log('Socket connected successfully', {
        id: socket.id,
        transport: socket.io.engine.transport.name,
        upgrade: socket.io.engine.transport.upgrade
    });
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    // Attempt to reconnect on disconnect
    if (reason === 'io server disconnect') {
        socket.connect();
    }
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});

socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('Attempting to reconnect:', attemptNumber);
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
});