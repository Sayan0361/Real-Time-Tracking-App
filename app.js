const express = require('express');
const http = require("http");
const socketio = require("socket.io");
const path = require("path");
const app = express();

const server = http.createServer(app);
const io = socketio(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");

// Socket.io connection
io.on("connection", function(socket) {
    console.log("New user connected:", socket.id);

    socket.on("send-location", (data) => {
        // Broadcast to all other clients
        socket.broadcast.emit("update-location", {
            id: socket.id,
            ...data
        });
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        io.emit("user-disconnected", socket.id);
    });
});

// Routes
app.get('/', (req, res) => {
    res.render("index");
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});