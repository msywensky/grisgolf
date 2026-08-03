#!/bin/zsh

#TODO make the port a config option
# get the port from the command line
uvicorn app.main:app --reload --port ${1:-8000}