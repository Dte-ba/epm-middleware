'use strict';

var Epm = require('epm');
var express = require('express');
var fs = require('fs');

module.exports = function(ops) {
  var app = express();
  var server;

  ops = ops || {};
  var engines = ops.engines || [];
  var defaultRepo = ops.default || '';

  if (!ops.path){
    throw new Error('The repository path is not defined `path` ');
  }

  if (!fs.existsSync(ops.path)){
    fs.mkdirSync(ops.path);
  }

  server = Epm.createServer(ops.path);

  app.listenRepositories = function(ops, fn) {
    if (typeof ops === 'function'){
      fn = ops 
      ops = {}
    }

    ops = ops || {}
    var port = ops.port || 3220;

    server
      .on('error', function(err){
        return fn && fn(err);
      })
      .once('listen', function(info){
        // use the engines
        Object.keys(server.repos).forEach(function(rname){
          var r = server.repos[rname];
          engines.forEach(function(e){
            r.use(e.name, e.engine);
          });
        });

        return fn && fn(null, info);
      });
    server.listen(ops);
  };

  app.use(function(req, res, next){
    if ('POST' != req.method.toUpperCase() && 'GET' != req.method.toUpperCase() && 'HEAD' != req.method.toUpperCase()) { return next(); }

    var reponame = req.query.repo;

    if (reponame === undefined) {
      reponame = defaultRepo;
    }
    process.REPOSITORY = server.repos[reponame];
    
    if (!process.REPOSITORY) {
      console.warn('Unknown repository');
    }

    return next();
  });

  app.get('/repository/:name?', function(req, res, next){
    var name = req.params.name;

    if (server.listening === undefined){
      return writeError({ error: 'The repository server is down' });
    }

    if (!name){
      return res.json( server.info() );
    }

    var r = server.repos[name];

    if (r === undefined){
      return writeError({ error: 'The repository ' + name + ' doesn\'t exists' });
    }

    r.packages.info(function(err, data){
      if (err) return writeError(err);
      
      res.json(data);
    });
  });

  app.get('/package', function(req, res, next){
    var reponame = req.params.reponame;

    if (server.listening === undefined){
      return writeError({ error: 'The repository server is down' });
    }

    if (server.repos.length === 0){
      return writeError({ error: 'The server not have repositories' });
    }

    var r = process.REPOSITORY;

    if (r === undefined){
      return writeError({ error: 'Unknown repository' });
    }

    var resolver = r.createResolver();

    resolver
      .on('error', function(err){
        next(err);
      })
      .on('complete', function(result){
        if (!writeResolved(result, res)){
          next(new Error('Unknown request'));
        }
      })
      .request(req);

  });

  return app;

  function writeError(error, res){
    return res.json(error);
  }

  /**
   * Write epm-pad-engine resutls
   */
  function writeResolved(info, res, statusCode){
    statusCode = statusCode || 200;

    if (info.type === 'json'){

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(statusCode);
      res.end(JSON.stringify(info.data));

      return true;
    } else if (info.type === 'file') {
      // content || assets
      res.sendFile(info.filename);

      return true;
    } else if (info.type === 'files') {
      // content with mutiple files
      if (info.files.length === 1){
        res.sendFile(info.files[0].filename);
      } else {
        var bpath = extractBasepath(info.files.map(function(f){ return f.filename; }));

        var relfiles = info.files.map(function(f){
          var fname = f.filename.replace(/\\/ig, '/');
          return fname.replace(bpath, '');
        });

        var htmls = relfiles.filter(function(rf){
          return (/\.html$/i).test(rf);
        });

        // the index HTML
        var ihtml = htmls.filter(function(h){ 
          return /index.htm(l)?/ig.test(h);
        });

        var idxhtml = ihtml.length > 0 ? ihtml[0] : undefined;

        if ( idxhtml === undefined){
          // index.html doesn't exists 
          // any html
          idxhtml = (htmls.length > 0 ? htmls[0] : undefined)
        }

        var route = '/content/' + info.uid;
        if (app.cacheContent[route] === undefined){
          app.cacheContent[route] = {
            path: bpath,
            index: idxhtml
          };
        }
        var r = route;
        var item = app.cacheContent[route];
        if (item.index !== undefined){
          r += '/' + item.index;
        }
        res.redirect(r);
      }

      return true;
    }

    return false;

    function extractBasepath(entries) {

      var dirs = entries.map(function(e){ return path.dirname(e); });

      var sdirs = dirs.map(function(d){ return d.split('\\')});

      var idx = 0;
      var curr;
      var root = '';
      var eq;

      do {

        curr = sdirs[0][idx];

        var have = _.all(sdirs, function(sd){ return sd.length > idx; });
        eq = have;
        if (have === true){
          eq = _.all(sdirs.map(function(a){ return a[idx]; }), function(i){
            return curr === i;
          });
        }

        if(eq) {
          root += curr + '/';
        }

        idx++;

      } while(eq === true)

      return root;
    }
  }

};