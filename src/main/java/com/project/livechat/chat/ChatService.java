package com.project.livechat.chat;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@RequiredArgsConstructor
@Service
public class ChatService {

    private final ChatRepo repo;

    public ChatMessage saveChatMessage(ChatMessage message) {

      return  repo.save(message);
    }
    public void deleteById(Integer id) {
        repo.deleteById(id);
    }

    public ChatMessage save(ChatMessage message) {
        message.setTimestamp(Instant.now());
        return repo.save(message);
    }

    public List<ChatMessage> findAll() {
        return (List<ChatMessage>) repo.findAll();
    }



}
