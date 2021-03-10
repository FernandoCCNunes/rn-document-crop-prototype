import React, { Component } from "react";
import {
    StatusBar,
    Image,
    NativeModules,
    LayoutChangeEvent,
    LayoutRectangle,
    PanResponder,
    StyleSheet,
    Platform,
    PanResponderInstance,
} from "react-native";

import { Button, Icon, Text, View } from "native-base";

import Svg, { Polygon } from "react-native-svg";

import { launchImageLibraryAsync } from "expo-image-picker";
import { ImageInfo } from "expo-image-picker/build/ImagePicker.types";

const { RNDocumentScanner } = NativeModules;

export interface Photo {
    uri: string
    base64: string
}

interface Point {
    x: number
    y: number
    length?: number
}

type Points = Point[]


interface DocumentCropProps {

}

interface DocumentCropState {
    photo: Photo|null
    croppedPhoto: Photo|null
    points: Points | null
    layout: LayoutRectangle | null
    zoomOnPoint: any
}

class DocumentCrop extends Component<DocumentCropProps, DocumentCropState> {

    constructor(props: DocumentCropProps) {
        super(props);
        this.state = {
            photo: null,
            croppedPhoto: null,
            points: null,
            layout: null,
            zoomOnPoint: null
        };
    }

    componentDidMount = async () => {
        this._launchLibrary();
    };

    private _launchLibrary = () => {
        launchImageLibraryAsync({
            includeBase64: true,
            quality: .7,
            mediaType: "photo"
        }).then((response) => {
            console.log("response: ", response);
            if (!response.cancelled) {
                const result = response as ImageInfo;
                this._setPhoto(result.uri, result.base64!);
            }
        });
    };

    private _cropImage = async () => {
        // console.log("crop:", this._getCropSquare().crop)
        // ImageManipulator.manipulateAsync(this.state.photo?.uri!, [{
        //     crop: this._getCropSquare().crop
        // }], {
        //     base64: true
        // }).then((result) => {
        //     this._setPhoto(result.uri, result.base64!)
        // })

        const finalOptions = {
            width: -1,
            height: -1,
            thumbnail: false
        };

        const result = await RNDocumentScanner.crop(this.state.points, finalOptions);
        console.log("result: ", result);
        if (result.image !== undefined) {
            this.setState({
                croppedPhoto: {
                    uri: result.image,
                    base64: ""
                }
            })
        }
    };

    private _detectEdges = () => {
        if (this.state.photo !== null) {
            const uri = this.state.photo.uri.replace("file:/", "");
            RNDocumentScanner.detectEdges(
                uri,
                this.state.layout
            ).then((points: Points) => {
                this.setState({ points: this._applyMinCropSquare(points) });
            });

        }
    };

    private _applyMinCropSquare = (points: Points): Points => {
        const newPoints = [...points];
        const topLeft = points[0];
        const topRight = points[1];
        const bottomRight = points[2];
        const bottomLeft = points[3];

        const distanceTlTr = this._distanceTo(topLeft, topRight);
        const distanceTlBl = this._distanceTo(topLeft, bottomLeft);

        if (distanceTlTr < 100) {
            topRight.x = topRight.x + (100 - distanceTlTr);
            topRight.y = topLeft.y;
            bottomRight.x = topRight.x;
        }

        if (distanceTlBl < 100) {
            bottomLeft.y = bottomLeft.y + (100 - distanceTlBl);
            bottomRight.y = bottomLeft.y;
        }

        return newPoints;
    };

    private _distanceTo = (pointA: Point, pointB: Point): number => {
        return (pointB.x - pointA.x) + (pointB.y - pointA.y);
    };

    private _getPolygonPoints = () => {
        const points = this.state.points!!;
        let pointsAsString = "";

        points.forEach((point, index) => {
            pointsAsString += `${point.x},${point.y}`;
            if (point.length === undefined || index !== point.length - 1) {
                pointsAsString += " ";
            }
        });

        return pointsAsString;
    };

    private _canPointMove = (pointIndex: number, moveX: number, moveY: number): boolean => {
        const points = this.state.points!!;

        const sideMinSize = IMAGE_CROPPER_POINT_CONTAINER_SIZE;

        switch (pointIndex) {
            case 0:
                return (
                    points[1].x - moveX >= sideMinSize &&
                    points[3].y - moveY >= sideMinSize &&
                    points[2].x - moveX >= sideMinSize &&
                    points[2].y - moveY >= sideMinSize
                );

            case 1:
                return (
                    moveX - points[0].x >= sideMinSize &&
                    points[2].y - moveY >= sideMinSize &&
                    moveX - points[3].x >= sideMinSize &&
                    points[3].y - moveY >= sideMinSize
                );

            case 2:
                return (
                    moveX - points[3].x >= sideMinSize &&
                    moveY - points[1].y >= sideMinSize &&
                    moveX - points[0].x >= sideMinSize &&
                    moveY - points[0].y >= sideMinSize
                );

            case 3:
                return (
                    points[2].x - moveX >= sideMinSize &&
                    moveY - points[0].y >= sideMinSize &&
                    points[1].x - moveX >= sideMinSize &&
                    moveY - points[1].y >= sideMinSize
                );
        }

        return false;
    };

    _createPanResponderForPoint = (pointIndex: number): PanResponderInstance => {
        const points = this.state.points!!;

        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                this.setState({ zoomOnPoint: points[pointIndex] });
            },
            onPanResponderMove: (evt, gestureState) => {
                this.setState({
                    points: points.map((point, index) => {
                        if (index === pointIndex) {
                            if (
                                this._canPointMove(
                                    pointIndex,
                                    point.x + gestureState.dx,
                                    point.y + gestureState.dy
                                )
                            ) {
                                return {
                                    x: point.x + gestureState.dx,
                                    y: point.y + gestureState.dy
                                };
                            }
                        }

                        return point;
                    }),
                    zoomOnPoint: points[pointIndex]
                });
            },
            onPanResponderRelease: () => {
                this.setState({ zoomOnPoint: null });
            }
        });
    };

    private _getImageZoomStyleForCurrentHoldingPoint = () => {
        const { zoomOnPoint } = this.state;
        const adjustment = ZOOM_CONTAINER_SIZE / 2;

        return {
            marginLeft: -zoomOnPoint.x + adjustment - ZOOM_CURSOR_BORDER_SIZE,
            marginTop: -zoomOnPoint.y + adjustment - ZOOM_CURSOR_SIZE / 2
        };
    };

    private _clearPhoto = (): void => {
        this.setState({ photo: null, points: null });
        this._launchLibrary();
    };

    private _setPhoto = (uri: string, base64: string): void => {
        this.setState({ photo: { uri, base64, cropped: false } as Photo });
    };

    private _isCropping = (): boolean => {
        return this.state.points !== null;
    };

    private _hasCroppedPhoto = (): boolean => {
        return this.state.croppedPhoto !== null
    }

    private _shouldRenderCropFrame = (): boolean => {
        return this.state.points !== null && this.state.points.length > 0 && !this._hasCroppedPhoto()
    }

    private _onImageLayoutCalculated = (event: LayoutChangeEvent) => {
        if (this.state.layout === null) {
            this.setState({
                layout: event.nativeEvent.layout
            });
        }

    };

    private _onRemoveButtonPress = () => {
        if (this._hasCroppedPhoto()) {
            console.log("here")
            this.setState({
                croppedPhoto: null,
                points: null
            })
            return
        }
        this._clearPhoto()
    };

    private _onCropButtonPress = () => {
        if (this._isCropping()) {
            this.setState({
                points: null
            })
            return;
        }
        this._detectEdges();
    };

    private _onSelectButtonPress = () => {
        if (this._isCropping()) {
            this._cropImage();
            return;
        }
    };

    render() {
        return (
            <View style={{ flex: 1 }}>
                <StatusBar barStyle="dark-content" />
                {this.renderCroppedPhoto()}
                {this._renderPhoto()}
                {this.renderImageCropPolygon()}
                {this._renderImageCropPoints()}
                {this._renderZoomOnPoint()}
                {this.renderBottomActionBar()}
            </View>
        );
    }

    private renderCroppedPhoto = () => {
        if (this.state.croppedPhoto !== null) {
            console.log("rendering cropped photo")
            return (
                <Image
                    source={{ uri: this.state.croppedPhoto.uri }}
                    style={{
                        resizeMode: 'contain',
                        width: '100%',
                        flex: 1
                    }}
                />
            )
        }
    }

    private _renderPhoto = () => {
        if (this.state.photo !== null && this.state.croppedPhoto === null) {
            console.log("rendering photo")
            return (
                <Image
                    onLayout={this._onImageLayoutCalculated}
                    source={{ uri: this.state.photo.uri }}
                    style={{
                        resizeMode: 'contain',
                        width: '100%',
                        flex: 1
                    }}
                />
            )
        }
    }

    private renderBottomActionBar = () => {
        if (this.state.photo !== null) {
            return (
                <View
                    style={{
                        position: "absolute",
                        left: 0,
                        bottom: 0,
                        right: 0,
                        paddingHorizontal: 16,
                        paddingVertical: 16,
                        backgroundColor: "rgba(0,0,0, .5)",
                        zIndex: 3,
                        elevation: 3,
                    }}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <View
                            style={{
                                alignItems: "center",
                                justifyContent: "center",
                                marginStart: 16
                            }}
                        >
                            <Button onPress={this._onRemoveButtonPress} icon rounded
                                    style={{ width: 56, height: 56, borderRadius: 28}}>
                                <Icon type={"MaterialCommunityIcons"} name={"close"} />
                            </Button>
                            <Text style={{ marginTop: 8 }}>
                                Remove
                            </Text>
                        </View>
                        <View
                            style={{
                                alignItems: "center",
                                justifyContent: "center"
                            }}
                        >
                            {this._renderCropButton()}
                        </View>
                        <View style={{
                            alignItems: "center",
                            justifyContent: "center",
                            marginEnd: 16
                        }}>
                            <Button onPress={this._onSelectButtonPress} icon rounded
                                    style={{ width: 56, height: 56, borderRadius: 28 }}>
                                <Icon type={"MaterialCommunityIcons"} name={"check"} />
                            </Button>
                            <Text style={{ marginTop: 8 }}>
                                Select
                            </Text>
                        </View>
                    </View>
                </View>
            );
        }
    };

    private _renderCropButton = () => {
        if (this.state.croppedPhoto === null) {
            return (
                <>
                    <Button primary={this._isCropping()} light={!this._isCropping()} onPress={this._onCropButtonPress} icon rounded
                            style={{ width: 56, height: 56, borderRadius: 28}}>
                        <Icon type={"MaterialCommunityIcons"} name={"crop"} />
                    </Button>
                    <Text style={{ marginTop: 8 }}>
                        Crop
                    </Text>
                </>
            )
        }
    }

    private renderImageCropPolygon = () => {
        if (this._shouldRenderCropFrame()) {
            const {
                width: containerWidth,
                height: containerHeight
            } = this.state.layout!!;
            return (
                <Svg
                    width={containerWidth}
                    height={containerHeight}
                    style={styles.imageCropperPolygonContainer}
                >
                    <Polygon
                        points={this._getPolygonPoints()}
                        fill="transparent"
                        stroke={CROPPER_COLOR}
                        strokeWidth="1"
                    />
                </Svg>
            );
        }
    };

    private _renderImageCropPoints = () => {
        if (this.state.points !== null && this.state.points.length > 0 && this._shouldRenderCropFrame()) {
            return this.state.points.map((point, index) => (
                <View
                    key={index}
                    style={[styles.imageCropperPointContainer,
                        {
                            top: point.y,
                            left: point.x
                        }
                    ]}
                    {...this._createPanResponderForPoint(index).panHandlers}
                >
                    <View
                        style={styles.imageCropperPoint}
                    />
                </View>
            ));
        }
    };

    private _renderZoomOnPoint = () => {
        if (this.state.zoomOnPoint !== null) {
            const { photo, points, zoomOnPoint } = this.state;
            const {
                width: containerWidth,
                height: containerHeight
            } = this.state.layout!!;

            return (
                <View
                    style={[
                        styles.zoomContainer,
                        { opacity: zoomOnPoint !== null ? 1 : 0 }
                    ]}
                >
                    {/* Image */}
                    <Image
                        source={{ uri: photo?.uri }}
                        resizeMode={Platform.OS === "ios" ? "stretch" : "cover"}
                        style={[
                            {
                                width: containerWidth,
                                height: containerHeight
                            },
                            zoomOnPoint !== null
                                ? this._getImageZoomStyleForCurrentHoldingPoint()
                                : {}
                        ]}
                        fadeDuration={0}
                    />

                    {/* Cursor */}
                    <View style={styles.zoomCursor}>
                        <View style={styles.zoomCursorHorizontal} />
                        <View style={styles.zoomCursorVertical} />
                    </View>
                </View>
            );
        }
    };

}


const IMAGE_CROPPER_POINT_CONTAINER_SIZE = 40;
const IMAGE_CROPPER_POINT_SIZE = 20;

const CROPPER_COLOR = "#0082CA";

const ZOOM_CONTAINER_SIZE = 120;
const ZOOM_CONTAINER_BORDER_WIDTH = 2;
const ZOOM_CURSOR_SIZE = 10;
const ZOOM_CURSOR_BORDER_SIZE = 1


const styles = StyleSheet.create({
    imageCropperPointContainer: {
        alignItems: "center",
        justifyContent: "center",
        position: "absolute",
        width: IMAGE_CROPPER_POINT_CONTAINER_SIZE,
        height: IMAGE_CROPPER_POINT_CONTAINER_SIZE,
        marginTop: -IMAGE_CROPPER_POINT_CONTAINER_SIZE / 2,
        marginLeft: -IMAGE_CROPPER_POINT_CONTAINER_SIZE / 2,
        zIndex: 2,
        elevation: 2,
    },
    imageCropperPoint: {
        width: IMAGE_CROPPER_POINT_SIZE,
        height: IMAGE_CROPPER_POINT_SIZE,
        borderRadius: IMAGE_CROPPER_POINT_SIZE / 2,
        backgroundColor: "rgba(255, 255, 255, 0.4)",
        borderWidth: 1,
        borderColor: CROPPER_COLOR
    },
    imageCropperPolygonContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1,
        elevation: 1,
    },
    zoomContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        width: ZOOM_CONTAINER_SIZE,
        height: ZOOM_CONTAINER_SIZE,
        borderRadius: ZOOM_CONTAINER_SIZE / 2,
        borderColor: "white",
        borderWidth: ZOOM_CONTAINER_BORDER_WIDTH,
        overflow: "hidden",
        backgroundColor: "black"
    },
    zoomCursor: {
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%"
    },
    zoomCursorHorizontal: {
        width: ZOOM_CURSOR_SIZE,
        height: ZOOM_CURSOR_BORDER_SIZE,
        backgroundColor: CROPPER_COLOR
    },
    zoomCursorVertical: {
        width: ZOOM_CURSOR_BORDER_SIZE,
        height: ZOOM_CURSOR_SIZE,
        marginTop: -ZOOM_CURSOR_SIZE / 2,
        backgroundColor: CROPPER_COLOR
    }
});


export default DocumentCrop;
