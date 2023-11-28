---
title: "Deployment and downtime"
date: 2023-11-28
summary: "When deploying you want to avoid any downtime i.e. you want your system to be functional over the deployment timespan. What are the caveats that one should be wary of?"
tags:
  - django
  - kubernetes
layout: "page"
---
# Deployment and downtime

Whenever you're deploying new code you don't want any downtime, you want your system to be able to process requests while deploying. 

There are many deployment strategies but in this article I'll focus on the rolling deployment from Django & Kubernetes perspective.

## Django migrations { .fs-3 }

Deleting a field is quite simple from Django perspective: you remove it from the model, generate the migration and apply it on the database. Easy-peasy right ?

Yes and no.

The issue with this approach is that your system may be unable to process requests coming while deploying. Let's take the following code as an example:

```python
# models.py
class User(models.Model):
    is_active = models.BooleanField(default=True)
    # ...

# views.py
def get_user_details(request):
    if not request.user.is_active:
        return render(request, "user_inactive.html")
    return render(request, "user_details.html")
```

A PR could be to remove that `is_active` field and its usage:

```python
# models.py
class User(models.Model):
    # ...

# views.py
def get_user_details(request):
    return render(request, "user_details.html")
```

So far all good. Let's look at a typical Kubernetes deployment strategy:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  # ...
spec:
  # ...
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 25%
      maxSurge: 25%
    replicas: 3
    # ...
```

And the migrations being applied in a pre-deployment Kubernetes job.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  # ...
  annotations:
    argocd.argoproj.io/hook: PreSync
spec:
  template:
    spec:
      # ...
      containers:
        - name: # ...
          image: # ...
          command: ["python", "manage.py", "migrate"]
```

Can you spot the issue ? 

We are first applying the migration (i.e. removing the field from the database) to then do the deployment, it means that until the deployment has finished, old pods will still be using the old code that uses `is_active`.

![Deployment](/posts/deployment-and-downtime/img/deployment.png)

The `web-server-old` pods have the code before the PR and if any of them get a request, it will hit the database looking for that `is_active` field, which was removed in the migration before the deployment ! It will lead in an error response, which can be OK if the migration and deployment are fast to run. 

But what if you added a custom migration on the same PR that is updating all users and it takes a long time to complete ? Then your system will be down for quite some time.

### Solution { .fs-4 }

The solution relies in breaking down that deployment in two: one removing any usage of the `is_active` field and the second one performing the migration to remove the field in the database.

Before:

```python
# models.py
class User(models.Model):
    is_active = models.BooleanField(default=True)
    # ...

# views.py
def get_user_details(request):
    if not request.user.is_active:
        return render(request, "user_inactive.html")
    return render(request, "user_details.html")
```

First deployment:

```python
# models.py
class User(models.Model):
    is_active = models.BooleanField(default=True)
    # ...

# views.py
def get_user_details(request):
    return render(request, "user_details.html")
```

Second deployment:

```python
# models.py
class User(models.Model):
    # ...

# views.py
def get_user_details(request):
    return render(request, "user_details.html")
```

That way when we remove that `is_active` field from the database, all the pods are already not using that field anymore.

It's also good to remember that by default Django migrations run inside [an ACID transaction and lock the table it performs migration on](https://docs.djangoproject.com/en/4.2/topics/migrations/#transactions). To prevent that behavior you can use `atomic=False`.

## Ingress { .fs-3 }

Another issue can lie in the deployment strategy. Let's look at the following manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  # ...
spec:
template:
spec:
containers:
  - name: # ...
    livenessProbe:
      tcpSocket:
        port: gunicorn
    readinessProbe:
      tcpSocket:
        port: gunicorn
```

- `livenessProbe` is used to know if a pod is healthy, if not it's killed
- `readinessProbe` controls whether a pod is ready to accept request

With that manifest, pods are taking requests when gunicorn is ready. But it doesn't mean that the pods finished booting up the Django web server and sometimes you can have a Nginx 502 response.

![Nginx 502](/posts/deployment-and-downtime/img/502-bad-gateway.png)

### Solution { .fs-4 }

It's better to have a `readinessProbe` sending a request to the Django web server, that way we are sure Django finished to boot up and we can start receiving request.

## Conclusion { .fs-3 }

One should be extremely careful with migrations, and not hesitate to do them one PR at a time.
