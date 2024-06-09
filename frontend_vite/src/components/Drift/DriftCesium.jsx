import { Viewer, Entity, BillboardGraphics } from "resium";
import { Cartesian3, Color } from 'cesium';
import { useEffect } from "react";
import { useWebSocket } from '../../context/WebSocketContext';

const DriftCesium = ({ satName, setSatPositions , satPositions}) => {
    const { longitude, latitude, altitude } = satPositions;
    // const position = Cartesian3.fromDegrees(longitude, latitude, altitude);
    const position = (longitude && latitude && altitude) ? Cartesian3.fromDegrees(longitude, latitude, altitude) : null;
    const pointGraphics = { pixelSize: 10, color: Color.RED };
    const { sendMessage, addMessageHandler } = useWebSocket();

    // console.log('satName:', satPositions);

    useEffect(() => {
        const handleSatelliteGroupMsg = (data) => {
            if (data.type === 'selectedSatPosition' && data.satName === satName) {
                setSatPositions(data.position);
                console.log(satPositions);
            }
        };

        addMessageHandler(handleSatelliteGroupMsg);
        if (satName !== null) {
            sendMessage({
                type: 'requestSelectedSatellitePosition',
                satName: satName
            }).catch(err => {
                // setError('Failed to send message to WebSocket.');
                console.error('WebSocket send error:', err);
            });
        }


        return () => {
            sendMessage({
                type: 'stopSelectedSatellitePosition',
                satName: satName
            }).catch(err => console.error('Failed to send stop message', err));
        };
    }, [satName]);

    return (
        <Viewer
            timeline={false}
            animation={false}
            geocoder={false}
            homeButton={false}
            // infoBox={false}
            projectionPicker={false}
            fullscreenButton={false}
            vrButton={false}
            navigationHelpButton={false}
            navigationInstructionsInitiallyVisible={false}
            shouldAnimate={true}>
            <Entity
                name="Satellite"
                position={position}
                description="Satellite"
                point={pointGraphics}
            >
            </Entity>
        </Viewer>
    );
}

export default DriftCesium;