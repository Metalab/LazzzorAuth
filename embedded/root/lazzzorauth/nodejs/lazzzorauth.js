/* Metalab Lazzzorauth

See https://metalab.at/wiki/Lazzzorauth for more info.

Author: overflo
Contributors: mzeltner
              Viehzeug */


/* TODO for those that would love to contribute

- auto_logout -> logout() call -> clear logout session vars at ONE place..
- laserjob_finished() -> reference job id in events
- expand respond() to our usecase
- Move globals into a nice Object structure

*/

var tty = "/dev/ttyACM0";
var keyfile = "../files/keylist.current";
var externalprice = '1.50';
var internalprice = '1.00';

var fs = require("fs");
var sys = require("util");
var sqlite3 = require('sqlite3').verbose();
var http = require('http');
var db = new sqlite3.Database('lazzzorauth.sqlite3');

// We always want SQLite and a http server, but during UI development we don't
// have a serial or firewall interactions -- also we listen on different ports
// when we're in a production environment
var firewall = true;
var listen = 80;
try {
  var serialport = require("serialport");
  var SerialPort = serialport.SerialPort; // localize object constructor
  var sp = new SerialPort(tty, {
    parser: serialport.parsers.readline("\n")
  });
} catch(err) {
  console.log("No serialport available");
  // Make a dummy serial
  var sp = new Object();
  sp.on = function() {};
  sp.write = function() {};
  firewall = false;
  listen = 8001;
}


/* globals.. this should be all in nice objects and stuff.. ya know right... :) */
var lazzzor_active = 0;
var logged_in_user = 0;
var logged_in_id = 0;
var logged_in_minuteprice = 0;


var auth_error = 0;
var auto_logout_timer = 0;

var external_user = 0;
var last_logged_in_user = 0;
var last_logged_in_id = 0;
var last_login_datetime = 0;

var lazzzor_start_timestamp = 0;


/* HTTP Interface
--------------------------------------------------------------- */

function respond(req, res) {

  if(req.method = 'GET') {

    if(!auth_error && logged_in_user != 0) {
      var html = '<html><head></head><body><p>User: %user%</p><p>ID: %id%</p><p>minuteprice: %minuteprice%</p></body></html>';
      var values = {
        '%user%': logged_in_user,
        '%id%': logged_in_id,
        '%minuteprice%': logged_in_minuteprice
      };


      res.end(html.replace(/%\w+%/g, function(all) {
        return values[all] || all;
      }));
    } else {
      res.writeHead(403, {
        'Content-Type': 'text/html'
      });
      res.end('Not Authorized');
    }

    res.writeHead(200, {
      'Content-Type': 'text/html'
    });

  } else {
    res.end();
  }

}


/* Serial helpers
---------------------------------------------------------------
SUPPORTED COMMANDS:
=======================
A<string>       prints <string> on the first line of the lcd
B<string>       prints <string> on the seconds line of the lcd
C<color code>   sets the background light to the specified color.
                the code is a combination of the flags RED(1),
                GREEN(2), and BLUE(4) and sent as a byte.
*/
var RED = 2;
var GREEN = 1;
var BLUE = 4;

function display(color, row1, row2) {
  console.log("SEND: C" + color);
  console.log("SEND: A" + row1);
  console.log("SEND: B" + row2);
  sp.write("C" + color + " \n");
  sp.write("A" + row1 + "\n");
  sp.write("B" + row2 + " \n");
}

function haxxorei() {
  display(GREEN, "Hack ze", "Plan3t");
}

function greeting() {
  display(BLUE, "Gentle(wo)man! ", "Please log in. ");
}

/* General
--------------------------------------------------------------- */
function get_timestamp() {
  return Math.round(new Date().getTime() / 1000);
}

/* Database
--------------------------------------------------------------- */
function pad(num) {
  var s = num + "";
  while(s.length < 2) s = "0" + s;
  return s;
}

function get_datetime_string() {
  var d = new Date();
  // '2012-11-02 21:47:18';
  var ret = "" + d.getFullYear() +
            "-" + pad(d.getMonth() + 1) +
            "-" + pad(d.getDate()) +
            " " + pad(d.getHours()) +
            ":" + pad(d.getMinutes()) +
            ":" + pad(d.getSeconds());
  return ret;
}

function save_event_in_db(what, who, id, comment) {
  var stmt = db.prepare('INSERT INTO events VALUES ("","' + get_datetime_string() + '",?,?,?,?)');
  stmt.run(what, who, id, comment);
}


function save_job_in_db(what) {
  var owner = (logged_in_user) ? logged_in_user : last_logged_in_user;
  var buttonid = (logged_in_id) ? logged_in_id : last_logged_in_id;
  var logged_in = (logged_in_user) ? 1 : 0;
  var minuteprice = (external_user) ? externalprice : logged_in_minuteprice;

  var comment = "";

  if(lazzzor_start_timestamp) {
    duration = get_timestamp() - lazzzor_start_timestamp;
  } else {
    duration = 1;
    comment = "ERROR! lazzzor_start_timestamp not set????";
  }

  var total = (duration * (minuteprice / 60)).toFixed(2);

  var stmt = db.prepare('INSERT INTO jobs VALUES ("","' + get_datetime_string() + '",?,?,?,?,?,?,?,?,?,?)');

  stmt.run(duration, owner, buttonid, logged_in, last_login_datetime, comment, minuteprice, total, "", external_user);
}

/* Authentication
--------------------------------------------------------------- */
function check_id(id) {
  if(!logged_in_id) {
    fs.readFile(keyfile, 'utf8', function(err, data) {

      if(err) throw err;
      var lines = data.split("\n");
      var found = 0;

      for(var i = 0; i < lines.length; i++) {
        var userdata = lines[i].split(",");
        if(userdata[0] == id) {
          found = 1;
          login_as(userdata[1], userdata[0], userdata[2]);
          break;
        }
      }

      if(!found) {
        if(!auth_error) {
          auth_error = 1;
          display(RED, id, "NOT AUTHORIZED");
          setTimeout(greeting, 2000);
        }
      }

    });
  }
}

function login_as(user, id, minuteprice_parameter) {
  if(!logged_in_id) {

    last_login_datetime = get_datetime_string();

    console.log(last_login_datetime);

    logged_in_minuteprice = (minuteprice_parameter) ? minuteprice_parameter : internalprice;
    logged_in_user = user;
    logged_in_id = id;
    display(GREEN + RED, id, "Authorized!");
    setTimeout(function(){
      display(GREEN, "Logged in as  ", logged_in_user);
    }, 3000);
    firewall_on();
    if(!auto_logout_timer) auto_logout_timer = setTimeout(auto_logout, 1000 * 60 * 5);
  }
}

function auto_logout() {
  save_event_in_db("LOGOUT", logged_in_user, logged_in_id, "AUTOLOGOUT");

  display(RED, "Auto-logout ", "after 5 min.");
  firewall_off();
  logged_in_user = 0;
  logged_in_id = 0;
  auth_error = 0;
  setTimeout(greeting, 5000);
}

function button_pressed(longpress) {
  if(logged_in_id && longpress) {
    external_user = 1;

    save_event_in_db("EXTERNALUSER", logged_in_user, logged_in_id, "");

    display(GREEN, "Ext Responsible: ", logged_in_user);
  } else if (logged_in_id) {
    log_out();
  } else {
    if (Math.floor((Math.random() * 10) + 1) == 2) {
      display(RED, "You like buttons ", "Don't you? ");
    } else {
      display(RED, "Push button.. ", "Nothing happens! ");
    }
    setTimeout(greeting, 2000);
  }
}

function log_out() {
  save_event_in_db("LOGOUT", logged_in_user, logged_in_id, "");

  if(auto_logout_timer) clearTimeout(auto_logout_timer);

  firewall_off();

  if(logged_in_user) {
    display(RED + GREEN, "Goodbye ", logged_in_user);
  }

  last_logged_in_user = logged_in_user;
  last_logged_in_id = logged_in_id;

  logged_in_user = 0;
  logged_in_id = 0;
  auth_error = 0;
  external_user = 0;

  setTimeout(greeting, 2000);
}

/* Laser
--------------------------------------------------------------- */
function laserjob_started() {
  if(!logged_in_id) {
    display(RED, "NO ACTIVE USER?  ", "LAZZZOR STARTED!? ")
    setTimeout(show_welcome, 5000);
  }

  lazzzor_start_timestamp = get_timestamp();
  console.log("A laserjob started!");
  save_event_in_db("LAZZZORON", logged_in_user, logged_in_id, "");
}



function laserjob_finished() {
  console.log("A laserjob finished!");

  save_job_in_db();
  save_event_in_db("LAZZZOROFF", logged_in_user, logged_in_id, "");

  lazzzor_start_timestamp = 0;
}

/* Firewall
--------------------------------------------------------------- */

function firewall_on() {
  if(firewall) {
    lazzzor_active = 1;
    save_event_in_db("FIREWALLON", logged_in_user, logged_in_id, "");

    fs.writeFile("/proc/sys/net/ipv4/ip_forward", "1", function(err) {
      if(err) {
        console.log("ERROR WITH PORTFORWARD" + err);
      } else {
        console.log("PORTFORWARD ENABLED");
      }
    });
  }
}

function firewall_off() {
  if(firewall) {
    lazzzor_active = 0;
    save_event_in_db("FIREWALLOFF", last_logged_in_user, last_logged_in_id, "");

    fs.writeFile("/proc/sys/net/ipv4/ip_forward", "0", function(err) {
      if(err) {
        console.log("ERROR WITH PORTFORWARD" + err);
      } else {
        console.log("PORTFORWARD DISABLED");
      }
    });
  }
}

/* Execution
--------------------------------------------------------------- */

firewall_off();
setTimeout(greeting, 2000);

/* Incoming serial commands
---------------------------------------------------------------
IXX-XXXXXXXXXXXX       read an ibutton with id XX-XXXXXXXXXXXX
B       button was pressed
X       button was LONG pressed (>1sec)
J       laserjob started
S       laserjob finished
H       hack ze planet..
Unsupported ---------------------------------------------------
E       read an ibutton but the CRC check failed
L       ibutton was removed
*/

sp.on("data", function(data) {
  switch(data[0]) {
    case "I":
      check_id(data.substr(1, 15));
      break;
    case "B":
      button_pressed(0);
      break;
    case "X":
      button_pressed(1);
      break;
    case "J":
      laserjob_started();
      break;
    case "S":
      laserjob_finished();
      break;
    case "H":
      haxxorei();
      break;
  }
});
console.log('Starting HTTP Server on port ' + listen);
http.createServer(respond).listen(listen);
