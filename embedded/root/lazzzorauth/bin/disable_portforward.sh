#!/bin/bash

echo "disabling portforward";

echo 0 > /proc/sys/net/ipv4/ip_forward
 
 
