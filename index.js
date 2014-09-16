var Epm = require('epm');
var express = require('express');
var fs = require('fs');

module.exports = function(ops) {
  var app = express();
  var server;

  ops = ops || {};
  engines = ops.engines || [];

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
    port = ops.port || 3220;

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

  return app;

  function writeError(error, res){
    return res.json(error);
  }
};