package com.project.livechat.entity;


import com.project.livechat.chat.ChatMessage;
import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.antlr.v4.runtime.misc.NotNull;

import java.util.List;

import static jakarta.persistence.GenerationType.SEQUENCE;

@Entity
@Table(name="users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @NotNull
    private String username;

    @Email
    @Column(unique = true)
    private String email;
    private String password;

    @OneToMany(mappedBy = "sender")
    private List<ChatMessage> messages;


}
