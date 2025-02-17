from typing import Any, Dict, List, Optional, Tuple, Union

from pydantic import BaseModel, Field
from typing_extensions import Literal


class GeoJSONGeometry(BaseModel):
    type: str
    # support point, line, or polygon,
    coordinates: Union[List[float], List[List[float]], List[List[List[float]]]]


class GeoJSONFeature(BaseModel):
    type: str
    geometry: GeoJSONGeometry
    properties: Dict[str, Union[bool, float, str]]


class GeoJSONFeatureCollection(BaseModel):
    type: str
    features: List[GeoJSONFeature]


class Feature(BaseModel):
    """Feature represents a single detection in a track."""

    frame: int
    bounds: List[int]
    attributes: Optional[Dict[str, Union[bool, float, str]]]
    geometry: Optional[GeoJSONFeatureCollection] = None
    head: Optional[Tuple[float, float]] = None
    tail: Optional[Tuple[float, float]] = None
    fishLength: Optional[float] = None
    interpolate: Optional[bool] = False
    keyframe: Optional[bool] = True


class Track(BaseModel):
    begin: int
    end: int
    trackId: int
    features: List[Feature] = Field(default_factory=lambda: [])
    confidencePairs: List[Tuple[str, float]] = Field(default_factory=lambda: [])
    attributes: Dict[str, Any] = Field(default_factory=lambda: {})

    def exceeds_thresholds(self, thresholds: Dict[str, float]) -> bool:
        defaultThresh = thresholds.get('default', 0)
        return any(
            [
                confidence >= thresholds.get(field, defaultThresh)
                for field, confidence in self.confidencePairs
            ]
        )


class Attribute(BaseModel):
    belongs: Literal['track', 'detection']
    datatype: Literal['text', 'number', 'boolean']
    values: Optional[List[str]]
    name: str
    key: str


class CustomStyle(BaseModel):
    color: Optional[str]
    strokeWidth: Optional[float]
    opacity: Optional[float]
    fill: Optional[bool]

    class Config:
        extra = 'forbid'


class MetadataMutableUpdate(BaseModel):
    """Update schema for mutable metadata fields"""

    customTypeStyling: Optional[Dict[str, CustomStyle]]
    confidenceFilters: Optional[Dict[str, float]]

    class Config:
        extra = 'forbid'


# interpolate all features [a, b)
def interpolate(a: Feature, b: Feature) -> List[Feature]:
    if a.interpolate is False:
        raise ValueError('Cannot interpolate feature without interpolate enabled')
    if b.frame <= a.frame:
        raise ValueError('b.frame must be larger than a.frame')
    feature_list = [a]
    frame_range = b.frame - a.frame
    for frame in range(1, frame_range):
        delta = frame / frame_range
        inverse_delta = 1 - delta
        bounds: List[float] = [
            round((abox * inverse_delta) + (bbox * delta))
            for (abox, bbox) in zip(a.bounds, b.bounds)
        ]
        feature_list.append(
            Feature(frame=a.frame + frame, bounds=bounds, keyframe=False)
        )
    return feature_list
