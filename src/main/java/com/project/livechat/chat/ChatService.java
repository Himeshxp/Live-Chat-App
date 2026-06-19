package com.project.livechat.chat;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Service;

@Service
public class ChatService {
    @Autowired
    private ChatRepo repo;

    public void saveChatMessage(ChatMessage message) {
        repo.save(message);
    }
}
