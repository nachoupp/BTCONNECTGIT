"""
Example Pybricks script - Motor Control
Demonstrates motor control with a simple rotation
"""
from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port
from pybricks.tools import wait

# Initialize hub and motor
hub = PrimeHub()
motor = Motor(Port.A)

print("Starting motor demo...")

# Rotate motor 360 degrees at 200 deg/s
motor.run_angle(200, 360)
print("Motor rotated 360 degrees")

wait(500)

# Rotate back
motor.run_angle(200, -360)
print("Motor returned to start position")

print("Demo complete!")
