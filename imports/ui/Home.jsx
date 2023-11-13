import React, { Component } from "react";
import "./stylesheets/Home.css";
import LocationForm from "./components/LocationForm";
import MapboxWatcher from "../api/classes/client/MapboxWatcher";
import Direction from "./components/Directions";


class Home extends Component {
    constructor(props) {
        super(props);
        this.props = props;
        MapboxWatcher.setWatcher(this, "location");
        this.state = {
            map: null,
        }
    }
    render() {
        console.log(this.state.map);
        MapboxWatcher.initiateWatch("location");
        return (
            <div className="main-container" id="map">
                <div className="menu-container">
                    <LocationForm mapObject={this.state.map} />
                </div>
                <Direction />
            </div>
        )
    }
}



export default Home;