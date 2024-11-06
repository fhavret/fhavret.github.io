---
title: "Introducing changes in Hexagonal architecture"
date: 2024-10-24
summary: "Introducing a new feature in the codebase can easily turn into a single huge PR, making it hard for developers to organize themselves to code these changes, as well as for developers reviewing the PR. In this post, we will see how to bring changes one PR at a time within a Hexagonal architecture codebase."
tags:
  - java
  - spring
layout: "page"
---

# Introducing changes in Hexagonal architecture

I recently developed a feature to enable the ability to specify a path for reports configuration, allowing generated reports to be uploaded directly to this path in [GCP storage](https://cloud.google.com/storage). This feature already existed for AWS storage, so a `CloudDriveFilePath` class already existed to represent a path in a cloud drive, including the `getFormattedFilePath` method to dynamically format any pre-defined patterns against a date (e.g. `"{YYYY}"` to `"2024"`).

You need to be familiar with hexagonal architecture — I recommend this well-written [post by Netflix](https://netflixtechblog.com/ready-for-changes-with-hexagonal-architecture-b315ec967749).

## Focusing on the `Domain` and `UseCase` layers { .fs-3 }

The idea in this first PR is to add the path attribute on the `Domain` layer and implement its usage when uploading the reports to GCP storage, but to provide an empty path in the other layers (`Web`, `Gateway`). This will allow getting the business logic in, without changing anything behavior-wise.

So starting with the `Domain`.

```java
// Domain — Core entity
public class GoogleCloudDrive {

  // ...

  private CloudDriveFilePath path;

  public GoogleCloudDrive(..., CloudDriveFilePath path) {
    // ...
    this.path = path;
  }

  public String getFormattedFilePath(String filename, LocalDateTime date) {
    var formattedPath = path.getFormattedFilePath(date);
    if (formattedPath.isEmpty()) {
      return filename;
    }
    return formattedPath + "/" + filename;
  }
}
```

And all the places referring to this class.

```java
// Web — Controller input mapper
public class WebCloudDriveMapper {
  public static CloudDrive map(WebCloudDrive webCloudDrive) {
    switch (webCloudDrive.getType()) {
      case GOOGLE_CLOUD_STORAGE -> {
        var webGoogleCloudDrive = (WebGoogleCloudDrive) webCloudDrive;
        return new GoogleCloudDrive(
          ...,
          CloudDriveFilePath.of("")
        )
      }
      // ...
    }
  }
}
```

```java
// Gateway — Database output mapper
public class DbCloudDriveMapper {
  public CloudDrive mapFromTblGoogleCloudDrive(TblGoogleCloudDrive tblGoogleCloudDrive) {
    return new GoogleCloudDrive(
      ...,
      CloudDriveFilePath.of("")
    )
  }
}
```

Then the `UseCase` layer, where this feature will actually be used.

```java
// UseCase — Actual usage of the feature
var now = LocalDateTime.now(clock);

gcpStorageGateway.put(
  (GoogleCloudDrive) reportCloudDrive.getCloudDrive(),
  googleCloudDrive.getFormattedFilePath(filename, now),
  inputStream, 
  secretKey);
}
```

## The `Gateway` layer { .fs-3 }

In this second PR, we introduce changes on the database level while the `Web` layer still provides the hardcoded empty value `""`. Allowing the persistence of the `path` attribute. 

```sql
// Gateway — Database schema
CREATE TABLE `tbl_google_cloud_drive`(
  // ...
  `path` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '',
  // ...
)
```

```java
// Gateway — Database JPA entity
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "tbl_google_cloud_drive")
class TblGoogleCloudDrive {
  // ...

  @Column(name = "path", nullable = false)
  private String path;
}
```

```java
// Gateway
public class DbCloudDriveMapper {
  // Database output mapper
  public CloudDrive mapFromTblGoogleCloudDrive(TblGoogleCloudDrive tblGoogleCloudDrive) {
    return new GoogleCloudDrive(
      // ...
      CloudDriveFilePath.of(tblGoogleCloudDrive.getPath())
    )
  }

  // Database input mapper
  public TblGoogleCloudDrive mapFromGoogleCloudDrive(GoogleCloudDrive googleCloudDrive,
      TblGoogleCloudDrive tblGoogleCloudDrive) {
    // ...
    tblGoogleCloudDrive.setPath(googleCloudDrive.getPath().getFilePathPattern());
  }
}
```

## The `Web` layer { .fs-3}

In this third and last PR, we focus on the `Web` layer. Allowing the feature to be exposed to the user interface.

```java
// Web — Controller payload
public class WebGoogleCloudDrive {
  // ...

  @Nullable
  private String path;
}
```

```java
// Web — Controller input mapper
public class WebCloudDriveMapper {
  public static CloudDrive map(WebCloudDrive webCloudDrive) {
    switch (webCloudDrive.getType()) {
      case GOOGLE_CLOUD_STORAGE -> {
        var webGoogleCloudDrive = (WebGoogleCloudDrive) webCloudDrive;
        return new GoogleCloudDrive(
          ...,
          webGoogleCloudDrive.getPath() != null
              ? CloudDriveFilePath.of(webGoogleCloudDrive.getPath())
              : CloudDriveFilePath.of("")
        );
      }
      // ...
    }
  }
}
```

```java
// Web — Controller output mapper
public class WebReportCloudDriveMapper {
  public static WebCloudDrive map(ChainReportCloudDrive chainReportCloudDrive) {
    switch (chainReportCloudDrive.getCloudDrive().getCloudDriveType()) {
      case GOOGLE_CLOUD_STORAGE -> {
        var googleDrive = (GoogleCloudDrive) chainReportCloudDrive.getCloudDrive();
        return new WebGoogleCloudDrive(
            ...,
            googleDrive.getPath().getFilePathPattern()
        );
      }
      // ...
    }
  }
}
```

## Conclusion { .fs-3 }

Breaking down changes into multiple smaller non-breaking PRs focusing each on a different layer allow a smoother review process and a better understanding of the changes. 

It is important to start from the core (`Domain`/`UseCase` layers) and expand to external dependencies (`Gateway`/`Web`).
