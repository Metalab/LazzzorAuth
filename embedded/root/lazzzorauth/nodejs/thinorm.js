var orm = require('thin-orm');

var data = {
  err: 0,
  results: [],
  count: 0
};

orm.table('jobs')
   .columns('rowid', 'timestamp', 'duration', 'owner', 'buttonid', 'logged_in',
            'last_log_in', 'comment', 'minuteprice', 'total', 'custom_total',
            'external_job');

orm.table('events')
   .columns('rowid', 'timestamp', 'event', 'owner', 'buttonid', 'comment')

var sqlite3 = require('sqlite3'),
    db = new sqlite3.Database('hackathon.sqlite3'),
    driver = orm.createDriver('sqlite', { db: db, logger: function(){} }),
    jobs = orm.createClient(driver, 'jobs'),
    events = orm.createClient(driver, 'events');


function callback(err, results) {
  data.err = err;
  data.results = results.rows;
  data.count = results.count;
  console.log(data.count);
}

jobs.findMany({criteria: { logged_in: 0 } }, callback);

setTimeout(function(){
for(var i = 0; i < data.count; i++) {
  console.log(data.results[i]);
}
}, 100);
//events.findMany({}, callback);
