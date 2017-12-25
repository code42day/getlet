const http = require('http');
const https = require('https');
const parse = require('url').parse;
const zlib = require('zlib');
const debug = require('debug')('getlet');

module.exports = getlet;

function getlet(u) {
  let self = {
    host,
    path,
    secure,
    pipe,
    method,
    send,
    url,
    header,
    auth,
    userAgent
  };

  let options = {
    headers: { 'Accept-Encoding': 'gzip, deflate' }
  };
  let redirects = Object.create(null);
  let transport = http;
  let data;

  function host(h) {
    options.host = h;
    return self;
  }

  function method(m) {
    options.method = m;
    return self;
  }

  function path(p) {
    options.path = p;
    return self;
  }

  function secure(flag) {
    transport = flag ? https : http;
    return self;
  }

  function header(name, value) {
    options.headers[name] = value;
    return self;
  }

  function send(d) {
    data = d;
    return self;
  }

  function userAgent(ua) {
    return header('User-Agent', ua);
  }

  function auth(username, password) {
    options.auth = typeof password === 'string'
      ? `${username}:${password}`
      : username;
    return self;
  }

  function isRedirect(res) {
    return Math.floor(res.statusCode / 100) === 3;
  }

  function isError(res) {
    return Math.floor(res.statusCode / 100) !== 2;
  }

  function isCompressed(res) {
    return (/^(deflate|gzip)$/).test(res.headers['content-encoding']);
  }

  function url(u) {
    let parsed = parse(u, false, true);
    if (parsed.host) {
      host(parsed.host);
    }
    if (parsed.path) {
      path(parsed.path);
    }
    if (parsed.protocol) {
      secure(parsed.protocol === 'https:');
    }
    if (parsed.auth) {
      auth(parsed.auth);
    }
  }

  function propagateError(err, stream) {
    debug('Error detected: %s', err);
    stream.emit('error', err);
    stream.end();
  }

  function isLoop() {
    let location = [options.protocol, options.host, options.path];
    if (redirects[location]) {
      return true;
    }
    redirects[location] = true;
  }

  function handleRedirect(res, stream) {
    let location = res.headers.location;
    debug('Redirecting to %s', location);
    url(location);
    if (isLoop()) {
      return propagateError('Redirect loop detected: ' + location, stream);
    }
    pipe(stream);
  }

  function pipe(stream) {
    let req = transport.request(Object.assign({}, options));
    if (data) {
      req.write(data);
    }
    isLoop(options);
    req.on('response', function(res) {
      if (isRedirect(res)) {
        return handleRedirect(res, stream);
      }
      if (isError(res)) {
        return propagateError('HTTP Error: ' + res.statusCode, stream);
      }
      if (isCompressed(res)) {
        debug('Decompress response');
        res = res.pipe(zlib.createGunzip());
      }
      res.pipe(stream);
    });
    req.on('error', function(err) {
      propagateError(err, stream);
    });
    debug('GET %s on %s', options.path, options.host);
    req.end();
    return stream;
  }

  if (u) {
    url(u);
  }

  return self;
}
