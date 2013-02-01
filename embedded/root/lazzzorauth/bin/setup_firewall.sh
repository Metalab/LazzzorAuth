#!/bin/bash

echo "enabling portforward";

#---------------------------------------------------------------
# Load the NAT module
#---------------------------------------------------------------
 
modprobe iptable_nat



target_port="1337"
 
external_int="eth0:0"
external_ip="192.168.100.100"


lazzzor_int="eth0:1"
lazzzor_ip="133.7.133.7"



#---------------------------------------------------------------
# Enable routing by modifying the ip_forward /proc filesystem file
#---------------------------------------------------------------
 
echo 1 > /proc/sys/net/ipv4/ip_forward
 
#---------------------------------------------------------------
# Allow port forwarding for traffic destined to port 80 of the
# firewall's IP address to be forwarded to port 8080 on server
#---------------------------------------------------------------
 
iptables -t nat -A PREROUTING -p tcp -i $external_int -d $external_ip \
     --dport 1337 --sport 1024:65535 -j DNAT --to $lazzzor_ip:1337
 
#---------------------------------------------------------------
# After DNAT, the packets are routed via the filter table's
# FORWARD chain.
# Connections on port 80 to the target machine on the private
# network must be allowed.
#---------------------------------------------------------------
 
iptables -A FORWARD -p tcp -i $external_int -o $lazzzor_int -d $lazzzor_ip \
    --dport 1337 --sport 1024:65535 -m state --state NEW -j ACCEPT
 
iptables -A FORWARD -t filter -o $external_int -m state \
         --state NEW,ESTABLISHED,RELATED -j ACCEPT
 
iptables -A FORWARD -t filter -i $external_int -m state \
         --state ESTABLISHED,RELATED -j ACCEPT
 
