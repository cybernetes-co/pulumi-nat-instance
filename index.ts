import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Create a new VPC
const vpc = new aws.ec2.Vpc("my-vpc", {
  cidrBlock: "10.0.0.0/16",
  enableDnsSupport: true,
  enableDnsHostnames: true,
});

// Create an Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("internet-gateway", {
  vpcId: vpc.id,
});

// Create a public subnet
const publicSubnet = new aws.ec2.Subnet("public-subnet", {
  vpcId: vpc.id,
  cidrBlock: "10.0.1.0/24",
  availabilityZone: "ap-southeast-1a",  // Replace with your preferred AZ
  mapPublicIpOnLaunch: true,
});

// Create a private subnet
const privateSubnet = new aws.ec2.Subnet("private-subnet", {
  vpcId: vpc.id,
  cidrBlock: "10.0.2.0/24",
  availabilityZone: "ap-southeast-1b",  // Replace with your preferred AZ
});

// Create a route table for the public subnet
const publicRouteTable = new aws.ec2.RouteTable("public-route-table", {
  vpcId: vpc.id,
  routes: [{
    cidrBlock: "0.0.0.0/0",
    gatewayId: internetGateway.id,
  }],
});

// Associate the public subnet with the public route table
const publicRouteTableAssociation = new aws.ec2.RouteTableAssociation("public-route-table-association", {
  subnetId: publicSubnet.id,
  routeTableId: publicRouteTable.id,
});

// Create a route table for the private subnet
const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
  vpcId: vpc.id,
});

// Associate the private subnet with the private route table
const privateRouteTableAssociation = new aws.ec2.RouteTableAssociation("private-route-table-association", {
  subnetId: privateSubnet.id,
  routeTableId: privateRouteTable.id,
});

// Create a security group for the NAT instance
const natSecurityGroup = new aws.ec2.SecurityGroup("nat-security-group", {
  vpcId: vpc.id,
  ingress: [{
    protocol: "tcp",
    fromPort: 0,
    toPort: 65535,
    cidrBlocks: ["0.0.0.0/0"],
  }],
  egress: [{
    protocol: "tcp",
    fromPort: 0,
    toPort: 65535,
    cidrBlocks: ["0.0.0.0/0"],
  }],
});


// Create a network interface for the NAT instance
const natNetworkInterface = new aws.ec2.NetworkInterface("nat-network-interface", {
  subnetId: publicSubnet.id,
  privateIp: "10.0.1.100",  // Static private 'IP' for the NAT instance
  sourceDestCheck: false, // disable src&dst check
  securityGroups: [natSecurityGroup.id],
});


// Look up for ubuntu-jammy-22 ami
const ubuntu = aws.ec2.getAmi({
  mostRecent: true,
  filters: [
    {
      name: "name",
      values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"],
    },
    {
      name: "virtualization-type",
      values: ["hvm"],
    },
  ],
  owners: ["099720109477"],
});

// Launch a NAT instance
const natInstance = new aws.ec2.Instance("nat-instance", {
  networkInterfaces: [{
    deviceIndex: 0,
    networkInterfaceId: natNetworkInterface.id,
  }],
  instanceType: "t2.micro",  // Replace with your preferred instance type
  ami: ubuntu.then(ubuntu => ubuntu.id),
  keyName: "my-test",  // Replace with your SSH key pair name
  userData: pulumi.interpolate`#!/bin/bash
        echo 1 > /proc/sys/net/ipv4/ip_forward
        echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
        iptables -t nat -A POSTROUTING -o eth0 -s ${privateSubnet.cidrBlock} -j MASQUERADE
        sysctl -p /etc/sysctl.conf
    `,
  tags: {
    Name: "nat-instance"
  }
});

// Create a route in the private route table to route traffic through the NAT instance
const privateRoute = new aws.ec2.Route("private-route", {
  routeTableId: privateRouteTable.id,
  destinationCidrBlock: "0.0.0.0/0",
  networkInterfaceId: natNetworkInterface.id
});

export const vpcId = vpc.id;
export const publicSubnetId = publicSubnet.id;
export const privateSubnetId = privateSubnet.id;
export const privateRouteId = privateRoute.id;
export const publicRouteTableAssociationId = publicRouteTableAssociation.id;
export const natSecurityGroupId = natSecurityGroup.id;
export const natInstanceId = natInstance.id;
export const publicDns = natInstance.publicDns
export const publicIP = natInstance.publicIp
