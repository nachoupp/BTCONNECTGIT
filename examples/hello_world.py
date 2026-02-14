"""
Example Pybricks script - Hello World
Demonstrates basic hub control and print output
"""
from pybricks.hubs import PrimeHub
from pybricks.tools import wait

# Initialize the hub
hub = PrimeHub()

# Turn on green light
hub.light.on((0, 255, 0))
print("Hello from SPIKE!")

# Wait 1 second
wait(1000)

# Turn off light
hub.light.off()
print("Goodbye!")
