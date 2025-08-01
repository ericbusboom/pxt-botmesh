
namespace radioptest {


    
    export function testJoystick() {

        serial.writeLine("Test joystick setup")

        // Initialize radiop
        radiop.init(1, 1);
       
        // Initialize joystick
        joystickp.init();

        let sendCounter = 80;
        basic.forever(function () {
            
            let changed = joystickp.sendIfChanged();

            if (changed) {
                serial.writeString('.')
                sendCounter--
                if (sendCounter <= 0) {
                    serial.writeLine(" ");
                    sendCounter = 80;
                }
            }
            pause(20);

        });
    }
}
