package com.project.livechat.chat;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatRepo extends JpaRepository<ChatMessage,Integer> {

    void deleteById(Integer id);

    @EntityGraph(attributePaths = "sender")
    List<ChatMessage> findTop100ByOrderByTimestampAsc();

    @EntityGraph(attributePaths = "sender")
    List<ChatMessage> findByConversationIdOrderByTimestampAsc(Integer conversationId);
}
