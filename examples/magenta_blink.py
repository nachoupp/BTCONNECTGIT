from pybricks.hubs import PrimeHub
from pybricks.parameters import Color
from pybricks.tools import wait

# Initialize the hub
hub = PrimeHub()

# Blink light in magenta (500ms on, 500ms off)
hub.light.blink(Color.MAGENTA, [500, 500])

# Wait for 3 seconds
wait(3000)

# Turn off the light
hub.light.off()
print("Test completed!")
