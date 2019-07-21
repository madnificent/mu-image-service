# mu-image-service

A service which yields resized images from high-resolution images in the backend.

It is often needed to render images at various sizes in the frontend.  Uploading the images in various resolutions manually is a cumbersome effort which could be automated.  The mu-image-service yields rescaled versions of images on demand and caches the intermediate results.

## How to use

Add the following snippet to your docker-compose.yml

```yaml
  imageservice:
    image: madnificent/mu-image-service
    links:
      - db:database
    volumes:
      - ./data/files:/share
```

Add the following in your dispatcher.ex

```elixir
  match "/images/*path" do
    Proxy.forward conn, path, "http://imageservice/image/"
  end
```

An image file compatible with the file-service with uuid imageUuid can now be requested at `GET /images/${imageUuid}?height=200&width=1280`.  Supplying either width or height is sufficient for this service to operate.

## Technical

The service uses sharp for resizing images.

## Local development

In order to develop the service locally, you will need a version of sharp in the node_modules which is compatible with the Docker images.  When running NPM install in the folder of the microservice on your local machine, it will fetch the binary for your development machine rather than for the Docker image.  These may be compatible, but that needn't be the case.

We populated our node_modules locally by running the following:

```bash
  #> cd mu-image-service
  #> docker run --rm -it -v `pwd`:/app /bin/bash
  $> cd /app
  $> npm install
  $> rm package-lock.json
  $> C-d
```

This gives us a node_modules folder with binaries compatible with the Docker image.

## Architecture

This section describes the general architecture of the mu-image-service.

  - A uuid is received from the frontend.
  - The image is looked up in the triplestore, assuming the model of the [file-service](https://github.com/mu-semtech/file-service).
  - We search for a cached image in the triplestore, relating to this image
  - V CACHED IMAGE: we create a stream for the cached resource
  - V CACHED IMAGE: we stream the cached image to the client
  - X CACHED IMAGE: we setup an image transformation pipeline with sharp
  - X CACHED IMAGE: a stream is setup with the original file as input to apply the transformation
  - X CACHED IMAGE: the stream writes to the client and to a file
  - X CACHED IMAGE: when the stream closes, metadata is written to the database so the cache can be found.

## Future work

Some tasks could be executed to make this service more foolproof.

  - [ ] Limit the resolutions which can be requested
  - [ ] Only allow resizing of images which sharp understands
  - [ ] Provide cache keys for [mu-cache](https://github.com/mu-semtech/mu-cache) support
  - [ ] Allow optional query pattern to be matched to select images which may be resized
