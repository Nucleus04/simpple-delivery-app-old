import React, { Component } from "react";
import MapboxWatcher from "../../api/classes/client/MapboxWatcher";
import mapboxgl from "mapbox-gl";

class LocationForm extends Component {
    constructor(props) {
        super(props);
        this.props = props;
        MapboxWatcher.setWatcher(this, "location");
        this.simulateRef = React.createRef();
        this.state = {
            starting_point_location: "",
            destination_point_location: [],
            map: null,
            marker_reference: null,
            geojson: null,
            parcelcoordinates: [],
            direction: null,
            numberOfRiders: "",
            routes: null,
            depart_at: null,
            isSelectingDestination: false,
            simulating: {
                state: false
            },
        }

    }

    timerId = null;
    onLocationChange(event) {
        const { name, value } = event.target;
        this.setState({
            [name]: value,
        })
        if (this.timerId) {
            clearTimeout(this.timerId);
        }
        this.timerId = setTimeout(() => {
            MapboxWatcher.search_place(value);
        }, 500);
    }
    onSelectStartingPoint(plcae_info) {
        console.log("Starting", plcae_info)
        this.setState({
            starting_point_location: plcae_info.place_name,
            isSelectingDestination: true,
        })

        this.state.map.setCenter(plcae_info.center);
        this.state.map.setZoom(12);
        const marker = new mapboxgl.Marker()
            .setLngLat(plcae_info.center)
            .addTo(this.state.map);
        this.setState({
            marker_reference: marker,
        })
        MapboxWatcher.setStart(plcae_info);
        MapboxWatcher.cleanSuggestedPlaces();
    }

    destinationMarker(place_info) {
        this.state.map.setCenter(place_info.center);
        this.state.map.setZoom(12);
        console.log(place_info);
        this.state.map.addSource(place_info.place_name, {
            type: "geojson",
            data: place_info,
        });


        this.state.map.addLayer({
            id: place_info.place_name,
            type: 'circle',
            source: place_info.place_name,
            paint: {
                'circle-radius': 11,
                'circle-color': '#FF0000',
            },
        })


    }
    onSelectingDestination(place_info) {
        console.log("Selecting destination", place_info);
        this.setState((prevState) => ({
            destination_point_location: [...prevState.destination_point_location, place_info.place_name],
            temp_destination: ""
        }))
        this.destinationMarker(place_info);
        MapboxWatcher.addDestination(place_info);
        MapboxWatcher.cleanSuggestedPlaces();

    }
    getRandomHexColor() {
        const letters = "0123456789ABCDEF";
        let color = "#";
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }
    drawRoute(geometry, defaultColor = null, defaultId = null) {
        let id = null;
        if (defaultId) {
            id = defaultId;
        } else {
            id = Math.random();
        }
        let color = null;
        if (defaultColor) {
            color = defaultColor;
        } else {
            color = this.getRandomHexColor();
        }
        this.state.map.addLayer({
            id: `${id}`,
            type: 'line',
            source: {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: geometry,
                },
            },
            layout: {
                'line-join': 'round',
                'line-cap': 'round',
            },
            paint: {
                'line-color': `${color}`,
                'line-width': 3,
            },
        });

        return {
            color: color,
            id: id,
        };
    }
    async getDirection() {
        let routes = await MapboxWatcher.nearestNeighbor(this.state.numberOfRiders, this.state.depart_at);
        this.setState({
            routes: routes,
        })
        let direction = [];
        for (const route of routes) {
            const data = {
                start: {
                    center: "",
                },
                destination: [],
                depart_at: this.state.depart_at,
            }
            data.start.center = route[0];
            route.shift();
            data.destination = route;
            const geojson = await MapboxWatcher.search_direction(data);
            const { color, id } = this.drawRoute(geojson.routes[0].geometry);
            direction.push({ geojson: geojson, color: color, id: id });
        }

        let result = await Promise.all(direction);
        console.log("RESULT", result);
        this.setState({
            direction: result,
        })
    }
    addParcelCoordinates(id, coordinates) {
        this.setState((prevState) => ({
            parcelcoordinates: [...prevState.parcelcoordinates, [coordinates.lng, coordinates.lat]],
        }));
        MapboxWatcher.addDestination([coordinates.lng, coordinates.lat]);
        this.state.map.addSource(`${id}`, {
            type: 'geojson',
            data: {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [coordinates.lng, coordinates.lat],
                },
                properties: {
                    description: `Customer-${id}`,
                }
            }
        });
        this.state.map.addLayer({
            id: `parcel-point-${id}`,
            type: 'circle',
            source: `${id}`,
            paint: {
                'circle-radius': 8,
                'circle-color': 'blue',
            },
        })
    }
    calculateDistance(coord1, coord2) {
        const earthRadius = 6371;

        const lat1 = this.toRadians(coord1[1]);
        const lon1 = this.toRadians(coord1[0]);
        const lat2 = this.toRadians(coord2[1]);
        const lon2 = this.toRadians(coord2[0]);

        const dLat = lat2 - lat1;
        const dLon = lon2 - lon1;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const distance = earthRadius * c;

        return distance;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    repaint(id, route) {
        let source = this.state.map.getSource(`${id}`);
        console.log("🚀 ~ file: LocationForm.jsx:223 ~ LocationForm ~ repaint ~ source:", source);
        console.log(source._data);
        let data = {
            type: 'Feature',
            properties: {},
            geometry: route.geometry,
        }
        source.setData(data);
        this.state.map.triggerRepaint();


    }
    async onSimulate(route, userCoordinates) {
        console.log(this.state.routes[route.i1]);
        if (this.calculateDistance(this.state.routes[route.i1][0], [userCoordinates.lng, userCoordinates.lat]) < 0.10) {
            console.log("Reach Destination");
            this.state.routes[route.i1].shift();
        }
        const data = {
            start: {
                center: [userCoordinates.lng, userCoordinates.lat],
            },
            destination: this.state.routes[route.i1],
            depart_at: this.state.depart_at,
        }
        const geojson = await MapboxWatcher.search_direction(data);
        this.state.map.removeLayer(`${route.id}`);
        this.state.map.removeSource(`${route.id}`);
        const { color } = this.drawRoute(geojson.routes[0].geometry, null, route.id);
        MapboxWatcher.setDirection(geojson.routes[0].legs[0].steps[0].maneuver.instruction);
        this.setState((prevState) => {
            const myDirection = [...prevState.direction];
            myDirection[route.i1] = { geojson: geojson, color: color, id: route.id };
            return {
                direction: myDirection,
            }

        });
        // const updatedRoute = { ...route.route };
        // const coordinates = route.route.geometry.coordinates;
        // let startIndex = 0;
        // let minDistance = this.calculateDistance([start.lng, start.lat], coordinates[0]);
        // console.log("🚀 ~ file: LocationForm.jsx:226 ~ LocationForm ~ onSimulate ~ minDistance:", minDistance)
        // if (minDistance > 0.20) {
        //     console.log("Out of route 200 m");
        // } else {
        //     for (let i = 1; i < coordinates.length; i++) {
        //         const distance = this.calculateDistance([start.lng, start.lat], coordinates[i]);
        //         console.log("🚀 ~ file: LocationForm.jsx:246 ~ LocationForm ~ onSimulate ~ distance:", distance)
        //         if (distance < minDistance) {
        //             console.log("ADDDDDDDD");
        //             startIndex = startIndex + 1;
        //             minDistance = distance;
        //         }
        //     }
        //     console.log(startIndex);
        //     let slice = coordinates.slice(startIndex);
        //     console.log("🚀 ~ file: LocationForm.jsx:253 ~ LocationForm ~ onSimulate ~ slice:", slice)
        //     let newArray = [[start.lng, start.lat], ...slice];
        //     console.log("🚀 ~ file: LocationForm.jsx:255 ~ LocationForm ~ onSimulate ~ newArray:", newArray)
        //     updatedRoute.geometry.coordinates = newArray;
        //     this.repaint(route.id, updatedRoute);
        //     this.setState((prevState) => {
        //         const prev = { ...prevState };
        //         const simulate = { ...prev.simulating };

        //         simulate.route = updatedRoute;
        //         prev.simulating = simulate;

        //         return prev;
        //     })
        // }

    }
    async selectDestination() {
        this.setState({
            isSelectingDestination: !this.state.isSelectingDestination,
        })
        this.state.map.on('click', (e) => {
            const coordinates = e.lngLat;
            if (this.state.isSelectingDestination)
                this.addParcelCoordinates(Math.random(), coordinates);
            else
                if (this.state.simulating.state) {
                    this.onSimulate(this.state.simulating, coordinates);
                }
        })

    }
    meter_to_kilamoter(meter = 0) {
        let km = Math.floor(Number(meter) / 1000);
        let m = Math.floor(Number(meter) % 1000);
        return `${km} kilometer and ${m} meters`
    }
    seconds_to_hour(seconds = 0) {
        let hour = Math.floor(Number(seconds) / 3600);
        let minutes = Math.floor((Number(seconds) % 3600) / 60);
        let remainingSeconds = Number(seconds) % 60;

        return `${hour} h : ${minutes} m : ${Math.floor(remainingSeconds)} s`;
    }
    choosingRouite(geojson, color, id) {

        this.state.map.removeLayer(`${id}`);
        this.state.map.removeSource(`${id}`);
        this.drawRoute(geojson.geometry, color, id);
        geojson.legs.color = color;
        MapboxWatcher.setDirection(geojson.legs[0].steps[0].maneuver.instruction);

    }
    onNumberOfRiderChange(event) {
        this.setState({
            numberOfRiders: event.target.value,
        })
    }
    onDepartureChange(event) {
        this.setState({
            depart_at: event.target.value,
        })
    }
    async onEnter(index, id) {
        let coord = this.state.routes[index];
        let coordinates = [...coord];
        const data = {
            start: {
                center: this.state.routes[index][0],
            },
            destination: [],
            depart_at: this.state.depart_at,
        }
        coordinates.shift();
        data.destination = coordinates;
        data.destination.push(this.state.routes[index][0])
        const geojson = await MapboxWatcher.search_direction(data);
        this.state.map.removeLayer(`${id}`);
        this.state.map.removeSource(`${id}`);
        const { color } = this.drawRoute(geojson.routes[0].geometry, null, id);
        this.setState((prevState) => {
            const myDirection = [...prevState.direction];
            myDirection[index] = { geojson: geojson, color: color, id: id };
            return {
                direction: myDirection,
            }

        });
        console.log(this.state.routes);
    }
    formatDateToHumanReadable(stringDate) {
        let date = new Date(stringDate);
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        };

        const formatter = new Intl.DateTimeFormat(undefined, options);

        return formatter.format(date);
    }
    formatDateToHumanReadableArrive(stringDate, seconds) {
        let date = new Date(stringDate);
        date.setSeconds(date.getSeconds() + seconds);
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        };

        const formatter = new Intl.DateTimeFormat(undefined, options);

        return formatter.format(date);
    }
    simulateMove(id, color, route, i1, i2) {
        this.setState({
            simulating: {
                state: true,
                id: id,
                color: color,
                route: route,
                i1: i1,
                i2: i2,
            },
            isSelectingDestination: false,
        })
    }
    componentDidMount() {
        const localDate = new Date();
        const localTimeZoneOffset = localDate.getTimezoneOffset();
        localDate.setMinutes(localDate.getMinutes() - localTimeZoneOffset);
        const localISOString = localDate.toISOString().slice(0, 16);
        this.setState({
            depart_at: localISOString,
        })
        console.log(this.state.depart_at);
        mapboxgl.accessToken = "pk.eyJ1IjoibnVjbGV1czA0IiwiYSI6ImNsbzNic29ycDE1ODAya28zY2RpdmdqbWcifQ.6Mlc0pRlwX5Ck2BkNrYS6A";
        this.state.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-74.5, 40],
            zoom: 9,
        });
    }
    render() {
        MapboxWatcher.initiateWatch("location");
        return (
            <div className="location-form-container">
                <div className="search-box-container-location">
                    <p style={{ textAlign: "center", fontSize: "16pt", fontWeight: "900", margin: "0" }}>Directions</p>
                    <input type="text" name="starting_point_location" onChange={this.onLocationChange.bind(this)} value={this.state.starting_point_location} className="input-starting-point margin-top-10" placeholder="Your depot" />
                    <input onChange={this.onNumberOfRiderChange.bind(this)} value={this.state.numberOfRiders} type="number" name="starting_point_location" className="input-starting-point margin-top-10" placeholder="Number of delivery man" />
                    <button className="location-search-button margin-top-10 button-green" onClick={this.getDirection.bind(this)}>Go</button>
                    <button className="location-search-button margin-top-10 button-green" onClick={this.selectDestination.bind(this)}>Select Drop Off location</button>

                    <div className="suggested-place-container margin-top-10 ">
                        {
                            MapboxWatcher.SuggestedPlace.map((item, index) => {
                                return (
                                    <div className="location-suggested-item fontsize-11 " key={index} onClick={() => this.state.isSelectingDestination ? this.onSelectingDestination(item) : this.onSelectStartingPoint(item)}>{item.place_name}</div>
                                )
                            })
                        }
                    </div>
                </div>

                {
                    this.state.direction && this.state.direction.map((direction, index) => {
                        return (
                            <div className="route-container margin-top-10" key={index}>

                                <div className="route-item-container margin-top-5" style={{ backgroundColor: direction.color }}>
                                    <p className="font-size-10">Rider {index + 1}</p>
                                    <input type="datetime-local" placeholder="departure" onChange={this.onDepartureChange.bind(this)} /> <button onClick={() => this.onEnter(index, direction.id)}>depart</button>

                                    {
                                        direction.geojson.routes.map((route, index2) => {
                                            return (
                                                <div className="route-item-container margin-top-5" >
                                                    <div onClick={() => this.choosingRouite(route, direction.color, direction.id)} key={index2}>
                                                        <p className="font-weight-600">Route {index2 + 1} {index2 === 0 ? "( fastest )" : ""}</p>
                                                        <p className="font-size-10">Depart at: {this.formatDateToHumanReadable(direction.geojson.depart_at)}</p>
                                                        <p className="font-size-10">Arrive at: {this.formatDateToHumanReadableArrive(direction.geojson.depart_at, Number(route.duration))}</p>
                                                        <p className="font-size-10">Duration: {this.seconds_to_hour(route.duration)}</p>
                                                        <p className="font-size-10">Duration (if not traffic): {this.seconds_to_hour(route.duration_typical)}</p>
                                                        <p className="font-size-10">Distance: {this.meter_to_kilamoter(route.distance)}</p>
                                                    </div>
                                                    <button onClick={() => this.simulateMove(direction.id, direction.color, route, index, index2)}>Simulate</button>
                                                </div>
                                            )
                                        })
                                    }
                                </div>


                            </div>
                        )
                    })
                }
            </div>
        )
    }
}


export default LocationForm;