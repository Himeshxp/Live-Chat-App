package com.project.livechat.chat;

import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatRepo extends CrudRepository<ChatMessage,Long> {

    void deleteById(Integer id);
}
