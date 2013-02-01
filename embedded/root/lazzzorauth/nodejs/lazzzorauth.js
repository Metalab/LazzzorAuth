var tty="/dev/ttyACM0";
var keyfile="/root/lazzzorauth/files/keylist.current";
var externalprice='1.50';
var internalprice='1.00';



// TODO   auto_logout -> logout() call  -> clear logout session vars at ONE place..


/* no need to touch below here */



var fs = require("fs");
var sys = require("util");

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('lazzzorauth.sqlite3');

var serialport = require("serialport");
var SerialPort = serialport.SerialPort; // localize object constructor
var sp = new SerialPort(tty, {
    parser: serialport.parsers.readline("\n")
});



/* globals.. this should be all in nice objects and stuff.. ya know right... :) */
var lazzzor_active=0;
var logged_in_user=0;
var logged_in_id=0;
var logged_in_minuteprice=0;


var auth_error=0;
var auto_logout_timer=0;

var external_user=0;
var last_logged_in_user=0;
var last_logged_in_id=0;
var last_login_datetime=0;

var lazzzor_start_timestamp=0;


var RED =2;
var GREEN =1;
var BLUE =4;



/* GO GO GO!!! */



 firewall_off();


 setTimeout(show_welcome,2000);




function get_timestamp()
{
 return Math.round(new Date().getTime() / 1000);
}




function pad(num) {
    var s = num+"";
    while (s.length < 2) s = "0" + s;
    return s;
}

function get_datetime_string()
{
  var d = new Date();
  var ret =  "" + d.getFullYear() + "-" + pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());//  '2012-11-02 21:47:18';


  return ret;

}



function save_event_in_db(what,who,id,comment)
{
 // save to DB
    var stmt = db.prepare('INSERT INTO events VALUES ("","'+get_datetime_string()+'",?,?,?,?)');
    stmt.run(what,who,id,comment);
}


function save_job_in_db(what)
{
 // save to DB
/*
CREATE TABLE lazzzorjobs (
 rowid,
 timestamp TEXT,
 duration TEXT,
 owner TEXT,
 buttonid TEXT,
 logged_in INTEGER,
 last_log_in TEXT,
 comment TEXT,
 minuteprice TEXT,
 total TEXT,
 custom_total TEXT,
 external_job INTEGER
);
*/


var owner =     (logged_in_user) ? logged_in_user : last_logged_in_user;
var buttonid =  (logged_in_id)   ? logged_in_id : last_logged_in_id;
var logged_in = (logged_in_user) ? 1 : 0;
var minuteprice= (external_user) ? externalprice : logged_in_minuteprice;



var comment="";





if(lazzzor_start_timestamp)
{
 duration=get_timestamp() - lazzzor_start_timestamp;
}
else
{
 duration=1;
 comment="ERROR! lazzzor_start_timestamp not set????";
}

var total=(duration*(minuteprice/60)).toFixed(2);



    var stmt = db.prepare('INSERT INTO jobs VALUES ("","'+get_datetime_string()+'",?,?,?,?,?,?,?,?,?,?)');

    stmt.run(duration,owner,buttonid,logged_in,last_login_datetime,comment,minuteprice,total,"",external_user);
}




/*

SUPPORTED COMMANDS:
=======================
A<string>       prints <string> on the first line of the lcd
B<string>       prints <string> on the seconds line of the lcd
C<color code>   sets the background light to the specified color.
                the code is a combination of the flags RED(1),
                GREEN(2), and BLUE(4) and sent as a byte.



SUPPORTED EVENTS:
=======================
IXX-XXXXXXXXXXXX    read an ibutton with id XX-XXXXXXXXXXXX
E                   read an ibutton but the CRC check failed
L                   ibutton was removed
B                   button was pressed
X		    button was LONG pressed (>1sec)
J 		    laserjob started
S		    laserjob finished
H		    hack ze planet..
*/


sp.on("data", function (data) {

var x="";
switch (data[0])
{
case "I":
//  x="ID scanned";
  check_id(data.substr(1,15));
  break;

case "B":
//  x="Button long pressed!";
  button_pressed(0);
  break;

case "X":
//  x="Button pressed! Logout";
  button_pressed(1);
//  log_out();
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


// CRC ERROR
case "E":
//  x="CRC ERROR";
  break;

case "L":
 // i dont care if the button is in or not.
 // button_removed();
  break;

}

});

function haxxorei()
{
 color(GREEN);
 display("Hack ze","Plan3t");

}


function show_goodbye()
{
if(logged_in_user)
{
 color(RED+GREEN);
 display("Goodbye ", logged_in_user);
}
}




function show_logged_in()
{
 color(GREEN);
 display("Logged in as  ",logged_in_user);
}

function show_welcome()
{

 // thats where we start
 logged_in_user=0;
 logged_in_id=0;
 auth_error=0;
 external_user=0;


 color(BLUE);
 display("Gentle(wo)man! ","Please log in. ");
}





function color(color)
{
/*
RED(1),
GREEN(2)
BLUE(4)
*/

sp.write("C"+color+" \n");

}

function display_error(row1,row2)
{
 color(RED); 
 display(row1,row2);
}

function display(row1,row2)
{
 console.log("SEND: A"+row1);
 console.log("SEND: B"+row2);



 sp.write("A"+row1+"\n");
 sp.write("B"+row2+" \n");
}


// looks up id in userfile
function check_id(id)
{
if(!logged_in_id)
{
	fs.readFile(keyfile,'ascii', function (err, data) {
	  if (err) throw err;
	  var lines = data.split("\n");
	  var found=0;
		
	  for(var i=0; i<lines.length; i++){
	          var userdata = lines[i].split(",");
	          if(userdata[0] == id)
	          {
	           found=1;
	           login_as(userdata[1],userdata[0],userdata[2]);
	           break;
	          }
	  }
	if(!found)
	{
	 if(!auth_error)
	 {
	  auth_error=1;
	  display_error(id,"NOT AUTHORIZED");
	  setTimeout(show_welcome,2000);
	 }
	}

});
}
}



//
function login_as(user,id,minuteprice_parameter)
{
 if(!logged_in_id)
 {

  last_login_datetime= get_datetime_string();

  console.log( last_login_datetime);

  logged_in_minuteprice=(minuteprice_parameter) ?  minuteprice_parameter : internalprice;
  logged_in_user=user;
  logged_in_id=id;
  color(GREEN+RED);
  display(id,"Authorized!");
  setTimeout(show_logged_in,3000);
  firewall_on();
  if(!auto_logout_timer)
   auto_logout_timer = setTimeout(auto_logout,1000*60*5);
 }
}



function auto_logout()
{
   // DB ENTRY HERE
 save_event_in_db("LOGOUT",logged_in_user,logged_in_id,"AUTOLOGOUT");


 color(RED);
 display("Auto-logout ","after 5 min.");
 firewall_off();
 logged_in_user=0;
 logged_in_id=0;
 auth_error=0;
 setTimeout(show_welcome,5000);
}


function show_logged_in_responsibility()
{
 color(GREEN);
 display("Ext Responsible: ",logged_in_user);
}



function button_pressed(longpress)
{

if(logged_in_id)
{
 if(longpress)
 {
   external_user=1;

   // DB ENTRY HERE
  save_event_in_db("EXTERNALUSER",logged_in_user,logged_in_id,"");

   show_logged_in_responsibility(); 
 }
 else 
  log_out();
 }
 else
 {
  // nobody logged in
{
  color(RED);
  if(Math.floor((Math.random()*10)+1)==2)
  {
     display("You like buttons ","Don't you? ");
  }
  else
     display("Push button.. ","Nothing happens! ");
 setTimeout(show_welcome,2000);
}

 }
}
function log_out()
{

   // DB ENTRY HERE
 save_event_in_db("LOGOUT",logged_in_user,logged_in_id,"");


 if(auto_logout_timer)
  clearTimeout(auto_logout_timer);


 firewall_off();
 show_goodbye();


 last_logged_in_user=logged_in_user;
 last_logged_in_id=logged_in_id;

/*
 logged_in_user=0;
 logged_in_id=0;
 auth_error=0;
 external_user=0;

*/



 setTimeout(show_welcome,2000);
}





function laserjob_started()
{

if(!logged_in_id)
{
 display("NO ACTIVE USER?  ","LAZZZOR STARTED!? ")
 color(RED);
 setTimeout(show_welcome,5000);

}

 // log start in DB
 lazzzor_start_timestamp = get_timestamp();
 console.log("A laserjob started!");
 save_event_in_db("LAZZZORON",logged_in_user,logged_in_id,"");

}



function laserjob_finished()
{
 // log end in DB
 console.log("A laserjob finished!");

 save_job_in_db();
 // TODO SAVE IN JOB DB, ADD ID TO EVENTDB
 save_event_in_db("LAZZZOROFF",logged_in_user,logged_in_id,"");

 lazzzor_start_timestamp =0;
}










// do some network magic

function firewall_on()
{
 lazzzor_active=1;
 // DB ENTRY HERE
 save_event_in_db("FIREWALLON",logged_in_user,logged_in_id,"");

fs.writeFile("/proc/sys/net/ipv4/ip_forward", "1", function(err) {
    if(err) {
        console.log("ERROR WITH PORTFORWARD" + err);
    } else {
        console.log("PORTFORWARD ENABLED");
    }
}); 


}

function firewall_off()
{
 lazzzor_active=0;
   // DB ENTRY HERE
 save_event_in_db("FIREWALLOFF",last_logged_in_user,last_logged_in_id,"");



fs.writeFile("/proc/sys/net/ipv4/ip_forward", "0", function(err) {
    if(err) {
        console.log("ERROR WITH PORTFORWARD" + err);
    } else {
        console.log("PORTFORWARD DISABLED");
    }
});

}



