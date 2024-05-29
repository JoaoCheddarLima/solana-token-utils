#!/bin/bash
echo "Starting the build process"

read -p "Please type your commit message: " x

echo "Running the save of the current answer"

echo "Starts the commit and push process"

echo "Staging your build"

git add .

echo "Commiting your build"

git commit -m "$x"

echo "Pushing your build"

git push -u origin main

echo "Build pushed"