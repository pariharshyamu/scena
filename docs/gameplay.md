
## Riding: `RideController`

A horse is not a car, and controlling one like a car is what makes most game horses feel wrong. Three differences are worth modelling, and this is all of them:

```ts
const ride = new RideController({ topSpeed: 11.5 });
game.onUpdate((t) => {
  ride.update(t.delta, { urge: axis.y, rein: axis.x, halt: input.isDown('Space') });
  ride.applyTo(horse.object, t.delta);
  gaits.update(t.delta, ride.speed);     // ANIMA picks walk/trot/canter/gallop
});
```

- **It answers late.** There is a beat between the rider's ask and the horse's answer (`response`). Instant acceleration reads as a vehicle.
- **It steers less the faster it goes** (`stiffness`). A galloping horse carries too much of itself forward to turn sharply; a walking one pivots almost on the spot. Constant turn rate is the second-biggest tell.
- **It slows down on its own.** Take the leg off and it comes back to a halt (`settle`) rather than coasting forever — and because ANIMA picks the gait from the speed, a riderless horse settles *down through the gaits*, canter to trot to walk to a stand, without any extra code.

The gait itself is deliberately **not** chosen here: hand `speed` to ANIMA's `QuadrupedLocomotion` and the animal picks its own, exactly as in life. Pairs with `TouchControls` for phones — the joystick becomes leg and rein with no branching. See the **riding** example.
