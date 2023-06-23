# -*- coding: utf-8 -*-
"""
@author: thomleysens
"""
import requests
import geopandas as gpd
from shapely.geometry import Point, LineString


class GdfFromApi:
    """
    Get a GeoDataFrame from an API request
    """
    def __init__(
        self,
        base_url,
        headers={
            "Accept":"application/json"
        }
    ):
        """
        Parameters
        ----------
        base_url (str): API Base URL
        headers (dict): Request headers
                        Default: {
                            "Accept":"application/json"
                        }
        """
        self.base_url = base_url
        self.headers = headers
        
    def get(
        self, 
        sub_url, 
        params,
        positive_codes=[200,206]
    ):
        """
        Make request and GeoDataFrame
        
        Parameters
        ----------
        sub_url (str): API additional URL
        params (dict): Dict of key:value parameters
        positive_codes (list): List of valid results code
                               Default: [200, 206]
                               
        Return
        ------
        gdf (GeoDataFrame)
        """
        url = "{}{}".format(
            self.base_url,
            sub_url
        )
        response = requests.get(
            url,
            headers=self.headers,
            params=params
        )
        self.status_code = response.status_code
        if self.status_code in positive_codes:
            if response.json()["features"] != []:
                gdf = gpd.GeoDataFrame.from_features(
                    response.json()["features"]
                ).set_crs(
                    epsg=4326
                )
            else:
                gdf = gpd.GeoDataFrame()
                print ("Empty response")
        else:
            print (
                "Error (status_code): {}".format(
                    self.status_code
                )
            )
            gdf = gpd.GeoDataFrame()
            
        return gdf

        
class GetNodeWay:
    """
    Get nodes and ways GeoDataFrame from 
    Overpass (OpenStreetMap data) request
    with bounding box
    """
    def __init__(
        self, 
        url="http://overpass-api.de/api/interpreter",
        timeout=25,
        to_drop=["nodes"]
    ):
        """
        Parameters
        ----------
        url (str): Overpass API URL 
                   Default: "http://overpass-api.de/api/interpreter"
        timeout (int): Timeout in seconds
                       Default: 25
        to_drop (list): List of columns to drop
                        Default: ["nodes"]
        """
        self.url = url
        self.start_str = "[out:json];("
        self.base_str = "nw['{}'='{}']{};"
        self.end_str = ");out geom;"
        self.to_drop = to_drop
        
    def get(
        self,
        bbox, 
        tags,
        positive_codes=[200]
    ):
        """
        Make request and GeoDataFrame
        
        Parameters
        ----------
        bbox (list): [
                            min lat, 
                            min lon, 
                            max lat, 
                            max lon
                    ]
        tags (list): List of OSM key/value tags 
        positive_codes (list): List of valid results code
        
        Return
        ------
        gdf (GeoDataFrame)
        
        """
        def _set_geom(x):
            if x.type == "node":
                geom = Point(
                    x.lon,
                    x.lat
                )
            elif x.type == "way":
                coords = [
                    (
                        y["lon"],
                        y["lat"]
                    ) for y in x.geometry
                ]
                geom = LineString(coords)
            else:
                geom = None

            return geom
            
        bboxes = [
            bbox for i in range(
                len(tags)
            )
        ]
        query = "".join(
            [
                self.base_str.format(
                    tag[0],
                    tag[1],
                    bbox
                ) for tag, bbox in zip(
                    tags,
                    bboxes
                )
            ]
        )
        self.query = "{}{}{}".format(
            self.start_str,
            query,
            self.end_str
        )
        response = requests.get(
            self.url, 
            params={
                "data": self.query
            }
        )
        self.status_code = response.status_code
        if self.status_code in positive_codes:
            elements = response.json()["elements"]
            gdfs = []
            if elements != []:
                gdf = gpd.pd.json_normalize(elements)
                gdf["geometry"] = gdf.apply(
                    lambda x: _set_geom(x),
                    axis=1
                )
                gdf = gpd.GeoDataFrame(gdf).set_crs(
                    epsg=4326
                )
                dropped_cols = []
                for col in self.to_drop:
                    if col in gdf.columns:
                        dropped_cols.append(col)
                gdf.drop(
                    columns=dropped_cols,
                    inplace=True
                )
            else:
                gdf = gpd.GeoDataFrame()
                print ("Empty response")
        else:
            print (
                "Error (status_code): {}".format(
                    self.status_code
                )
            )
            gdf = gpd.GeoDataFrame()
            
        return gdf
    
    
def bbox_from_poly(poly):
    """
    Transform Shapely Polygon to bounding box
    
    Parameters
    ----------
    poly (Shapely Polygon)
    
    Return
    ------
    bbox (list): [
                    min lat, 
                    min lon, 
                    max lat, 
                    max lon
                 ]
    """
    bbox = poly.exterior.xy
    bbox = (
        min(bbox[1]),
        min(bbox[0]),
        max(bbox[1]),
        max(bbox[0])
    )
    return bbox