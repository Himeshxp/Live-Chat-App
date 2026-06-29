package com.project.livechat.chat;


import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
@RequestMapping("/db")
public class DBRestController {
    public final ChatService chatService;

    @DeleteMapping("/{id}")
    public void deleteById(@PathVariable Integer messageid) {
       chatService.deleteById(messageid);
    }




}
