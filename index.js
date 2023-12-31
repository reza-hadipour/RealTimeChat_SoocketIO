const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();


const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/',(req,res,next)=>{
    res.send('./index.html');
})

server.listen(PORT, ()=> console.log(`Server is running on http://localhost:${PORT}`));

// Store connected users and their usernames
const users = new Map();

// Store chat message history for each room
const chatHistory = new Map();

io.on('connection',(socket)=>{
    console.log('A user connected');

    let username = '';
    let currentRoom = '';
    let recipient = '';

    socket.on('typing',(isTyping)=>{
        if(currentRoom){
            socket.to(currentRoom).emit('typing',{username,isTyping});
        }
    })

    socket.on('login', (user)=>{
        if(users.has(user)){
            socket.emit('loginError','user is already taken. Please choose another one.')
        }else{
            username = user;
            // Store the user and socket ID in the users map
            users.set(username,socket.id);
            console.log(`${username} logged in`);

            // Notify all users about new user count
            io.emit('userCount', users.size)
        }
    })

    // Listen for chat messages
    socket.on('chatMessage', (message)=>{

        // Store the message in the chat history for the current room
        if (currentRoom) {
            if (!chatHistory.has(currentRoom)) {
                chatHistory.set(currentRoom, []);
            }
            chatHistory.get(currentRoom).push({ user: username, message });
        }

        if(currentRoom && currentRoom !== username){
            // Chat room message
            io.to(currentRoom).emit('chatMessage',`${username} : ${message}`);
        }else if( !currentRoom && recipient){
            // private Message
            const recipientSocketId = users.get(recipient);
            if(recipientSocketId){
                io.to(recipientSocketId).emit('chatMessage',`(private) ${username}: ${message}`);
            }
        }
        // Broadcast the message to all connected users
        // io.emit('chatMessage',message);
    })

    // Listen for joining a chat room
    socket.on('joinRoom',(roomName)=>{
        // Leave the current room (if eny) before joining a new one
        if ( currentRoom){
            socket.leave(currentRoom);
        }

        socket.join(roomName);
        currentRoom = roomName;
        console.log(`${username} joined room: ${roomName}`);
        
        // Send message history to the user when they join a room
        if (chatHistory.has(currentRoom)) {
            const messageHistory = chatHistory.get(currentRoom);
            // console.log(messageHistory);
            socket.emit('messageHistory', messageHistory);
        }
    })

    // Listen for starting a private chat
    socket.on('privateChat', (recipientInput)=>{
        recipient = recipientInput.trim();
        if(users.has(recipient)){
            // start a private chat by leaving the current room (if any) and notifying the recipient to do the same
            if(currentRoom){
                socket.leave(currentRoom);
            }

            const recipientSocketId = users.get(recipient);
            if(recipientSocketId){
                io.to(recipientSocketId).emit('startPrivateChat',username);
                currentRoom = ''; // No specific room for private chat
                console.log(`${username} started a private chat with ${recipient}`);
            }
        }else{
            socket.emit('privateChatError',`User "${recipient} not found`);
        }
    })

    socket.on('disconnecting', (socket)=>{
        if(username){
            console.log('A user disconnected');
    
            // Remove the user from the users map
            users.delete(username);
            // console.log('users: ',users);
            console.log(`${username} logged out`);
    
            // Notify all users about the updated user count
            io.emit('userCount', users.size);
        }
    });
});