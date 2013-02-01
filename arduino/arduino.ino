/*
Code mostly written by metaz,
Adapted by overflo

Look here: http://metalab.at/wiki/Lazzzorauth


The Arduino build into the LazzzorAuth is an Arduino UNO but usses a DUEMILANOVE BOOTLOADER!
Choose Duemilanove as target if you modify this..




1/2/2013 - overflo@hackerspaceshop.com

*/

#include <OneWire.h>
#include <LiquidCrystal.h>



// for background light on LCD
#define RED 1
#define GREEN 2
#define BLUE 4


int LASERJOBSENSOR=A5; 





/* defines the characters used to send commands to the embeddedsystem */
//this code is followed by the button id
#define BUTTON_ID_SCANNED   'I'

// error is followed by error description (like CRC error)
#define ERROR_CODE  'E'

// when button is triggered
#define LOGOUT_USER  'B'
// when button is long pressed
#define EXTERNAL_USER_RESPONSIBLE  'X'

//button was removed, this event is ignored by embedded system
#define BUTTON_REMOVED  'L'

// sensor from valve magnetic field
#define LASERJOB_STARTED  'J'
#define LASERJOB_FINISHED  'S'









byte BACKLIGHT_PIN_RED = A1;
byte BACKLIGHT_PIN_GREEN = A0;
byte BACKLIGHT_PIN_BLUE = A2;

// if sensorvalue above this, we are fireing a lazzzor
int lasersensorthreshold=450;
// becomes millis() once job started
long laserjobrunning=0;
long lasertriggered=0;





int button_timer =0;

// initialize the library with the numbers of the interface pins
LiquidCrystal lcd(12, 11, 5, 4, 3, 7);


// inti onwwire lib
OneWire  ds(10);  // on pin 10

byte commandLen;
char receiveBuffer[200];
byte addr[8];
byte buttonDown=false;
byte buttonUp=false;
byte longpress=false;
unsigned long buttontimer;


void set_backlight_color(int color)
{
  //old codes were 1:RED, 2:GREEN, 3:BLUE
  digitalWrite(BACKLIGHT_PIN_RED, color & RED ? LOW : HIGH);
  digitalWrite(BACKLIGHT_PIN_GREEN, color & GREEN ? LOW : HIGH);
  digitalWrite(BACKLIGHT_PIN_BLUE, color & BLUE ? LOW : HIGH);
}

void lcd_show(char* line1,char* line2)
{
  lcd.setCursor(0, 0);      
  lcd.print("                ");
  lcd.setCursor(0, 1);      
  lcd.print("                ");
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

void send_packet(char code, char *additionalData) {
  if (additionalData)
  {
    Serial.print(code);
    Serial.println(additionalData);
  } else {
    Serial.println(code);
  }
}

void setup(void) {
  Serial.begin(9600);
  
  //setup pins for display backlight 
  pinMode(BACKLIGHT_PIN_RED, OUTPUT);
  pinMode(BACKLIGHT_PIN_GREEN, OUTPUT);
  pinMode(BACKLIGHT_PIN_BLUE, OUTPUT);  

 // setup pin for lassersensor (probably not nescessary but whatever)
  pinMode(LASERJOBSENSOR, INPUT);  


  attachInterrupt(0, buttonPressed_interrupt, CHANGE);  // button on pin digital B2

  // set up the LCD's number of columns and rows: 
  lcd.begin(16, 2);

  // Print a message to the LCD.
  lcd_show("Linux loading...","...hang in there");
  set_backlight_color(RED | BLUE);
}

// called from interrupt on button press
void buttonPressed_interrupt(void)
{
  
  if(!digitalRead(2)) // down
  {
   if(!buttonDown)
   {
    buttontimer=millis();
    buttonDown = 1;   
    buttonUp=0;
   }
  } 
  else // up
  {
   
   if(buttontimer>0)
   {
     if(millis() - buttontimer > 1000)   
       longpress=1; 

   }
     buttonDown=0;
     buttonUp=1;    
     buttontimer=0;  
  }
}

void handle_ibutton(void)
{
  static bool sent_ibutton_id = false;
  char outstr[20];

  bool got_ibutton = !!ds.search(addr);

  if (!got_ibutton) {
    if (sent_ibutton_id) {
      send_packet(BUTTON_REMOVED, NULL);
      sent_ibutton_id = false;
    }
    ds.reset_search();
  } else if (!sent_ibutton_id) {
    if (OneWire::crc8(addr, 7) != addr[7]) {
      send_packet(ERROR_CODE, NULL);
    } else {
      sent_ibutton_id = true;
      sprintf(outstr,"%02X-%02X%02X%02X%02X%02X%02X",addr[0],addr[6],addr[5],addr[4],addr[3],addr[2],addr[1]);
      send_packet(BUTTON_ID_SCANNED, outstr);
    }
  }
}

void show_error(char* message)
{
  for(int i=0;i<5;i++)
  {
      digitalWrite(BACKLIGHT_PIN_BLUE, LOW); 
      delay(200);
      digitalWrite(BACKLIGHT_PIN_BLUE, HIGH); 
      delay(200);
  }
  
  send_packet(ERROR_CODE, message);
  /* TODO: DISPLAY ERROR ON SCREEN */
  
}


void receive_command()
{
  Serial.setTimeout(250);
  commandLen = Serial.readBytesUntil('\n', receiveBuffer, sizeof(receiveBuffer));
  if (commandLen)
      receiveBuffer[commandLen] = '\0';
  else
    receiveBuffer[0] = '\0';
}

void execute_command(void)
{
  int i=0;

  if (!commandLen) return;
  switch(receiveBuffer[0])
  {
    //print line commands
    case 'A':
    case 'B':
      receiveBuffer[17] = '\0';
      for (i=commandLen; i < 17; i++)
        receiveBuffer[i] = ' ';
      lcd.setCursor(0, receiveBuffer[0]-'A');
      lcd.print(receiveBuffer+1);
      break;

    //background color commands
    case 'C':
      if (commandLen >= 2)
      {
        i = receiveBuffer[1];
        set_backlight_color(i);
      }
      break;
  }
}


void check_laser_sensor()
{
 int sensorvalue=analogRead(LASERJOBSENSOR);
 
 //Serial.println(sensorvalue);
// delay(500);
 
 if(sensorvalue<lasersensorthreshold)
 {

     lasertriggered++;
     if(lasertriggered>10)
     {    
      // set laserjobrunning 
      if(!laserjobrunning)
      {
        laserjobrunning=millis();
        send_packet(LASERJOB_STARTED, 0);
//        Serial.println("start laser");
      }
     }
 }
 else
 {
   
  lasertriggered=0; 
  if(laserjobrunning)
  { 
   // laerjob off after 2 seconds of low value 
   if((millis()-laserjobrunning)>2000); 
   {
     laserjobrunning=0;
     send_packet(LASERJOB_FINISHED, 0);
 //   Serial.println("stop laser");
   }  
  }
  
 }
   
  
}


void hackzeplanet()
{
 // NOTHING TO SEE HERE FOLKS, PLEASE MOVE ALONG...
 if(digitalRead(A4))
 {
   Serial.println("H");
   delay(1000);
 }
}

void loop(void) {
  if(buttonUp)
  { 
    if(longpress)
     send_packet(EXTERNAL_USER_RESPONSIBLE, 0);
    else
     send_packet(LOGOUT_USER, 0);
    buttonUp=false;
    buttonDown = false;
    longpress=false;
  }
  
  handle_ibutton();
  receive_command();
  execute_command();
  check_laser_sensor();
  
  hackzeplanet();

}
