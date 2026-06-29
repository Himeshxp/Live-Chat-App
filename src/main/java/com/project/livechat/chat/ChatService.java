package com.project.livechat.chat;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@RequiredArgsConstructor
@Service
public class ChatService {

    private final ChatRepo repo;

    public ChatMessage saveChatMessage(ChatMessage message) {
        if (message.getTimestamp() == null) {
            message.setTimestamp(Instant.now());
        }
        return repo.save(message);
    }
    public void deleteById(Integer id) {
        repo.deleteById(id);
    }

    public ChatMessage save(ChatMessage message) {
        message.setTimestamp(Instant.now());
        return repo.save(message);
    }

    public List<ChatMessage> findAll() {
        return repo.findTop100ByOrderByTimestampAsc();
    }

    @Transactional(readOnly = true)
    public List<ChatMessageResponseDTO> getMessageHistory() {
        return repo.findTop100ByOrderByTimestampAsc()
                .stream()
                .map(message -> new ChatMessageResponseDTO(
                        message.getSender() == null ? "Unknown" : message.getSender().getUsername(),
                        message.getContent(),
                        message.getType() == null ? MessageType.CHAT : message.getType(),
                        message.getTimestamp()
                ))
                .toList();
    }

}
