/**
 * Joystick blocks for micro:bit
 */
//% color=#0066CC weight=95 icon="\uf11b" blockNamespace="Joystick Radio"
//% 
namespace joystickp {

    let _lastSentPayload: JoyPayload = null;
    export let lastJoyPayload: JoyPayload = null;

    let _onReceiveJoyHandler: (payload: radiop.RadioPayload) => void = undefined;

        /**
     * Joystick value types
     */
    export enum JoystickValue {
        //% block="X"
        X = 0,
        //% block="Y"
        Y = 1,
        //% block="Accelerometer X"
        AccelX = 2,
        //% block="Accelerometer Y"
        AccelY = 3,
        //% block="Accelerometer Z"
        AccelZ = 4
    }

    /**
     * Joystick button types
     */
    export enum JoystickButton {
        //% block="A"
        A = 0,
        //% block="B"
        B = 1,
        //% block="Logo"
        Logo = 2,
        //% block="C"
        C = 3,
        //% block="D"
        D = 4,
        //% block="E"
        E = 5,
        //% block="F"
        F = 6
    }


    // Joystickbit pins for joystick and buttons
    export enum JoystickBitPin {
        C = DigitalPin.P12,
        D = DigitalPin.P13,
        E = DigitalPin.P14,
        F = DigitalPin.P15,
        X = AnalogPin.P1,
        Y = AnalogPin.P2,
    }

    let joystickInitialize = false;
    let defaultCenter = 512; // Default center value for joystick
    let jsXCenter = 512; // Default center value for joystick X
    let jsXOffset = 0; // Offset for joystick X
    let jsYCenter = 512; // Default center value for joystick Y
    let jsYOffset = 0; // Offset for joystick Y
    let jsDeadzone = 10; // Deadzone for joystick movement

    export function init(): void {
        if (joystickInitialize) return;
        joystickInitialize = true;
        pins.digitalWritePin(DigitalPin.P0, 0)
        pins.setPull(DigitalPin.P12, PinPullMode.PullUp)
        pins.setPull(DigitalPin.P13, PinPullMode.PullUp)
        pins.setPull(DigitalPin.P14, PinPullMode.PullUp)
        pins.setPull(DigitalPin.P15, PinPullMode.PullUp)
        pins.digitalWritePin(DigitalPin.P16, 1)

        // Calibrate joystick center position
        let xSum = 0;
        let ySum = 0;
        let sampleCount = 0;
        let startTime = input.runningTime();
        
        // Collect samples for 1 second
        basic.showIcon(IconNames.Sword);
        while (input.runningTime() - startTime < 1000) {
            xSum += pins.analogReadPin(JoystickBitPin.X);
            ySum += pins.analogReadPin(JoystickBitPin.Y);
            sampleCount++;
            basic.pause(10); // Small pause between readings
        }
        
        // Calculate average center positions
        if (sampleCount > 0) {
            jsXCenter = Math.round(xSum / sampleCount);
            jsYCenter = Math.round(ySum / sampleCount);
        }
        
        jsXOffset = jsXCenter - defaultCenter; // Adjust offset based on center
        jsYOffset = jsYCenter - defaultCenter; // Adjust offset based on center

        serial.writeLine("Joystick calibrated - Center X: " + jsXCenter + ", Y: " + jsYCenter);
        basic.showIcon(IconNames.Yes);
        basic.pause(200);
        basic.clearScreen();

    }
    /**
     * Joystick payload with x, y, buttons, and accelerometer data
     */
    export class JoyPayload extends radiop.RadioPayload {

        public x: number;
        public y: number;
        public buttons: number[];
        public accelX: number;
        public accelY: number;
        public accelZ: number;

        static PACKET_SIZE = 12; // Size of the payload in bytes

        constructor(x: number, y: number, buttons: number[], accelX: number, accelY: number, accelZ: number) {
            super(radiop.PayloadType.JOY, JoyPayload.PACKET_SIZE);
            this.fromValues(x, y, buttons, accelX, accelY, accelZ);
        }

        /**
         * Create a JoyPayload from a received buffer
         */
        static fromBuffer(buffer: Buffer): JoyPayload {
            // Extract values from buffer
            let x = Math.abs(buffer.getNumber(NumberFormat.UInt16LE, 1));
            let y = Math.abs(buffer.getNumber(NumberFormat.UInt16LE, 3));

            // There was a negative somewhere ...
            if (x > 65000) x = 0; // Clamp to valid range
            if (x > 1023) x = 1023; // Clamp to valid range
            if (y > 65000) y = 0; // Clamp to valid range
            if (y > 1023) y = 1023; // Clamp to valid range

            // Extract button bits
            let buttonBits = buffer.getNumber(NumberFormat.UInt8LE, 5);
            let buttons: number[] = [];
            for (let i = 0; i < 8; i++) {
                if (buttonBits & (1 << i)) {
                    buttons.push(i);
                }
            }
            
            let accelX = buffer.getNumber(NumberFormat.Int16LE, 6);
            let accelY = buffer.getNumber(NumberFormat.Int16LE, 8);
            let accelZ = buffer.getNumber(NumberFormat.Int16LE, 10);

            return new JoyPayload(x, y, buttons, accelX, accelY, accelZ);
        }

        /**
         * Create a JoyPayload from current hardware state
         */
        static fromHardware(readAccelerometer: boolean = false): JoyPayload {
            init()

            // Read joystick X and Y from analog pins
            let rawX = pins.analogReadPin(JoystickBitPin.X);
            let rawY = pins.analogReadPin(JoystickBitPin.Y);
            
            // Apply offsets to center the values
            let x = Math.abs(rawX - jsXOffset);
            let y = Math.abs(rawY - jsYOffset);

            // Check if values are within deadzone and reset to center if so
            if (Math.abs(x - defaultCenter) <= jsDeadzone) {
                x = defaultCenter;
            }
            if (Math.abs(y - defaultCenter) <= jsDeadzone) {
                y = defaultCenter;
            }
            
            // Read buttons (micro:bit built-in + joystick buttons)
            let buttons: number[] = [];
            if (input.buttonIsPressed(Button.A)) buttons.push(0);
            if (input.buttonIsPressed(Button.B)) buttons.push(1);
            if (input.logoIsPressed()) buttons.push(2);
            if (pins.digitalReadPin(JoystickBitPin.C) == 0) buttons.push(3);  // C button (active low)
            if (pins.digitalReadPin(JoystickBitPin.D) == 0) buttons.push(4);  // D button (active low)
            if (pins.digitalReadPin(JoystickBitPin.E) == 0) buttons.push(5);  // E button (active low)
            if (pins.digitalReadPin(JoystickBitPin.F) == 0) buttons.push(6);  // F button (active low)
            
            // Read accelerometer values only if requested
            let accelX = readAccelerometer ? input.acceleration(Dimension.X) : 0;
            let accelY = readAccelerometer ? input.acceleration(Dimension.Y) : 0;
            let accelZ = readAccelerometer ? input.acceleration(Dimension.Z) : 0;
            
            return new JoyPayload(x, y, buttons, accelX, accelY, accelZ);
        }

        private fromValues(x: number, y: number, buttons: number[], accelX: number, accelY: number, accelZ: number): void {
            // Store values
            this.x = Math.abs(x);
            this.y = Math.abs(y);
            this.buttons = buttons;
            this.accelX = accelX;
            this.accelY = accelY;
            this.accelZ = accelZ;

            // Build the buffer
            this.buffer.setNumber(NumberFormat.UInt16LE, 1, this.x);
            this.buffer.setNumber(NumberFormat.UInt16LE, 3, this.y);
            
            // Convert button array to single byte with bits set
            let buttonBits = 0;
            for (let i = 0; i < Math.min(this.buttons.length, 8); i++) {
                if (this.buttons[i] < 8) {
                    buttonBits |= (1 << this.buttons[i]);
                }
            }
            this.buffer.setNumber(NumberFormat.UInt8LE, 5, buttonBits);
            
            // Add accelerometer values
            this.buffer.setNumber(NumberFormat.Int16LE, 6, this.accelX);
            this.buffer.setNumber(NumberFormat.Int16LE, 8, this.accelY);
            this.buffer.setNumber(NumberFormat.Int16LE, 10, this.accelZ);
        }

        get payloadLength() {
            return this.buffer.length;
        }

        get hash(): number {
            // Simple hash based on x, y, buttons, and accelerometer values
            let hash = 0;
            hash ^= this.x;
            hash ^= this.y;
            for (let button of this.buttons) {
                hash ^= (1 << button);
            }
            hash ^= this.accelX;
            hash ^= this.accelY;
            hash ^= this.accelZ;
            return hash;
        }

        get str(): string {
            return `JoyPayload(x=${this.x}, y=${this.y}, buttons=[${this.buttons.join(", ")}], accelX=${this.accelX}, accelY=${this.accelY}, accelZ=${this.accelZ})`;
        }

        public buttonPressed(button: JoystickButton): boolean {
            return this.buttons.indexOf(button) !== -1;
        }

        get handler(): (payload: radiop.RadioPayload) => void {
            return _onReceiveJoyHandler;
        }
    }


    /**
     * Send the current joystick state over radio only if it is different from the previous one
     */
    //% blockId=joystick_send_if_changed block="send joystick state if changed"
    //% group="Events"
    //% weight=70
    export function sendIfChanged(): boolean {
        
        let jp = JoyPayload.fromHardware();

        let hasChanged = ( !_lastSentPayload || _lastSentPayload.hash != jp.hash);
        if ( hasChanged) {
            jp.send();
        }
        _lastSentPayload = jp;

        return hasChanged;
    }

    /**
     * Run code when a joystick message is received
     */
    //% blockId=joystick_on_receive block="on receive joystick"
    //% group="Events"
    //% weight=100
    export function onReceive(handler: (payload: joystickp.JoyPayload) => void) {
        radiop.init(); // Ensure radio is initialized
        
        _onReceiveJoyHandler = function (payload: JoyPayload) {
            lastJoyPayload = payload;
            handler(payload);
        };
    }

    export function sendJoyPayload(x: number, y: number, buttons: number[], accelX: number, accelY: number, accelZ: number): void {
        radiop.init();
        let payload = new joystickp.JoyPayload(x, y, buttons, accelX, accelY, accelZ);
        radio.sendBuffer(payload.getBuffer());
    }   

    //% blockId=joystick_value block="joystick %payload value %value"
    //% group="Values"
    //% weight=90
    export function getValue(payload: JoyPayload, value: JoystickValue): number {
        if (!payload) return 0;
        switch (value) {
            case JoystickValue.X: return payload.x;
            case JoystickValue.Y: return payload.y;
            case JoystickValue.AccelX: return payload.accelX;
            case JoystickValue.AccelY: return payload.accelY;
            case JoystickValue.AccelZ: return payload.accelZ;
            default: return 0;
        }
    }

    /**
     * Check if a button is pressed
     */
    //% blockId=joystick_button_pressed block="joystick button %button pressed"
    //% group="Values"
    //% weight=80
    export function buttonPressed(button: JoystickButton): boolean {
        if (!lastJoyPayload) return false;
        return lastJoyPayload.buttons.indexOf(button) !== -1;
    }


    /**
     * Run the joystick functionality
     */
    //% blockId=joystick_run block="run joystick functionality"
    export function run() {
        radiop.init();

        basic.forever(function () {
            joystickp.sendIfChanged();
        });

        input.onButtonPressed(Button.AB, function () {
            // Enter the mode to change the 
        });
    }


}