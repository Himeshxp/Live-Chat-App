# LiveChat 💬

A real-time one-to-one messaging application built using **Spring Boot**, **Spring WebSocket (STOMP)**, and **PostgreSQL**. Users can register, log in, search other users using a unique public ID, and exchange messages instantly with persistent chat history.

## ✨ Features

- User Registration & Login
- Real-time one-to-one messaging
- Unique Public ID for every registered user
- Search users using their Public ID
- Private conversations
- Persistent chat history
- Automatic timestamps
- REST APIs + WebSockets (STOMP)

## 🛠 Tech Stack

### Backend
- Java
- Spring Boot
- Spring Data JPA (Hibernate)
- Spring WebSocket (STOMP)
- PostgreSQL
- Maven
- Lombok

### Frontend
- HTML
- CSS
- Vanilla JavaScript

## 📂 Project Structure

```text
src
└── main
    ├── java
    │   └── com.project.livechat
    │       ├── Auth
    │       ├── chat
    │       ├── config
    │       ├── entity
    │       └── LiveChatApplication.java
    │
    └── resources
        ├── static
        │   ├── frontend
        │   │   ├── app.js
        │   │   ├── styles.css
        │   │   └── index.html
        │   └── index.html
        │
        ├── templates
        └── application.properties
```

## 🚀 Getting Started

### Clone the repository

```bash
git clone : https://github.com/Himeshxp/Live-Chat-App
cd LiveChat
```

### Configure PostgreSQL

Update your `application.properties`

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/chatapp
spring.datasource.username=YOUR_USERNAME
spring.datasource.password=YOUR_PASSWORD
```

### Run

```bash
mvn spring-boot:run
```

Visit:

```
http://localhost:8080
```

## 🔮 Future Improvements

- JWT Authentication
- Group Chats
- Read Receipts
- Typing Indicator
- File Sharing
- Online / Offline Status

---

⭐ If you found this project interesting, feel free to star the repository.