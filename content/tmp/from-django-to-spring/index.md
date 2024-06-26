---
title: "From Django to Spring"
date: 2024-03-09
summary: "From Django to Spring."
tags:
  - python
  - django
  - java
  - spring
layout: "page"
---

# What I like in Python/Django.

I won't go over stuff that I find necessary: active community, good documentation, support for most technologies (databases, message brokers, logging...)

## Python { .fs-4 }

- Decorator
- Multiple inheritance

## Django { .fs-4 }

- Migrations
- Out-of-the-box ORM
- Support for many databases
- Default `User` model (with database schema) with authentication out-of-the-box, groups and permissions
- Pagination out-of-the-box
- Custom signals
- Jinja templating is quite easy to use
- Form fully handled: validation, rendering, special view...
- Django messages
- Easily customize settings based on environment
- Everything is easily customizable in the framework

# What I lack and made me lean over Java/Spring

- Static typing
- Polymorphism
- Faster execution
- `django.po` or how to create merge conflicts
- Chaining functional operations is unreadable (where Java streams are just amazing)
- Optional chaining
- Unpopular opinion but... Java checked exceptions
- Java backward compatibility
- Spring Context makes code less verbose and testing easier

# Django concepts mapped to Spring

## Base model { .fs-4 }

```python
import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models

from crum import get_current_user

class BaseModel(models.Model):
    id = models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)
    created_at = models.DateTimeField(auto_now_add=True, editable=False, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="%(app_label)s_%(class)s_created_by_set",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        default=None,
    )
    modified_at = models.DateTimeField(auto_now=True, editable=False, db_index=True)
    modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="%(app_label)s_%(class)s_modified_by_set",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        default=None,
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        user = get_current_user()
        if isinstance(user, get_user_model()):
            if self._state.adding:
                self.created_by = user
            self.modified_by = user

        super().save(*args, **kwargs)
```

```java
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import javax.persistence.*;
import java.time.Instant;

@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public class BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    protected UUID id;

    @CreatedDate
    @Column(name = "created_at")
    protected Instant createdAt;

    @CreatedBy
    @Column(name = "created_by")
    private User createdBy;

    @LastModifiedDate
    @Column(name = "modified_at")
    protected Instant modifiedAt;

    @LastModifiedBy
    @Column(name = "modified_by")
    private User modifiedBy;
}
```

## Object signals { .fs-4 }

Signals

```python
from django.db.models.signals import (
    pre_delete, 
    pre_save, 
    post_delete, 
    post_save,
)
```

Entity callback

```java
import org.springframework.data.relational.core.mapping.event.BeforeSaveCallback;
import org.springframework.data.relational.core.mapping.event.AfterSaveCallback;

import org.springframework.data.relational.core.mapping.event.BeforeDeleteCallback;
import org.springframework.data.relational.core.mapping.event.AfterDeleteCallback;
```

### Custom { .fs-5 }

```python
from django.dispatch import Signal

my_signal = Signal()
```

```java
import org.springframework.data.mapping.callback.EntityCallback;

@FunctionalInterface
public interface MyEventCallback<T> extends EntityCallback<T> {

	T onMyEvent(T entity, 
		String collection); 
}
```