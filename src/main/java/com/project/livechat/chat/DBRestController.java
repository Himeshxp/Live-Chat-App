package com.project.livechat.chat;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * Internal utility endpoint for message management.
 * Currently exposes a delete-by-ID operation for admin/debug use.
 */
@RestController
@RequestMapping("/db")
@RequiredArgsConstructor
public class DBRestController {

    private final ChatService chatService;

    @DeleteMapping("/{id}")
    public void deleteById(@PathVariable Integer id) {
        chatService.deleteById(id);
    }
}
