
const { Server } = require("socket.io");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:3000", "https://medical-inventory-beta.vercel.app"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("New client connected", socket.id);

    // Listening for a "new-medication" event
    socket.on("new-medication", (data) => {
      console.log("New medication added:", data);
      // Broadcast the medication update to all connected clients
      io.emit("medication-updated", data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected", socket.id);
    });
  });

  return io;
};

module.exports = initSocket;
