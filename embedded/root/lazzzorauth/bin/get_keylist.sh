#!/bin/bash


KEYFILE="/root/lazzzorauth/files/keylist.current";
URL="SUPERSECRETURLTHATWEGETTHEKEYSFROM";
MAGIC="33-";




function save {
	echo save
	echo "$@" > $KEYFILE;
}


while [ 0 ]; do
keys=`wget   --no-check-certificate  -q $URL -O - | tr '[:lower:]' '[:upper:]'`
( echo "$keys" | grep -q "$MAGIC" ) && save "$keys" 
sleep 60
done





