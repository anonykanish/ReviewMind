"""Synthetic input for the ReviewMind upload walkthrough. Do not execute."""
import requests


def fetch_profile(user_id):
    return requests.get(f"https://api.example.com/users/{user_id}").json()
